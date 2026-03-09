from fastapi import APIRouter, Request, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from authlib.integrations.starlette_client import OAuth
from datetime import datetime, timedelta
from jose import jwt
import secrets
from typing import Optional
import httpx
from passlib.context import CryptContext
import uuid
import logging

from config import settings
from database import users_collection, refresh_tokens_collection
from models import (
    GoogleTokenRequest, GoogleUserInfo, UserResponse,
    User, AuthIdentity, RefreshToken, TokenResponse
)
from schemas.agent import AgentSignupRequest

router = APIRouter(prefix="/api/auth", tags=["authentication"])
logger = logging.getLogger(__name__)

# Security scheme for bearer token
security = HTTPBearer()

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Simple in-memory rate limiting
rate_limit_store = {}

def check_rate_limit(key: str, max_requests: int = 10, period: int = 60) -> bool:
    """Simple rate limiting function"""
    now = datetime.utcnow().timestamp()
    
    if key not in rate_limit_store:
        rate_limit_store[key] = []
    
    rate_limit_store[key] = [t for t in rate_limit_store[key] if now - t < period]
    
    if len(rate_limit_store[key]) >= max_requests:
        return False
    
    rate_limit_store[key].append(now)
    return True

# OAuth setup
oauth = OAuth()
oauth.register(
    name='google',
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile',
        'prompt': 'select_account'
    }
)

def create_access_token(data: dict) -> str:
    """Create a short-lived JWT access token with proper claims"""
    now = datetime.utcnow()
    expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        **data,
        "iss": "errandease-api",
        "aud": "errandease-web",
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    """Create a refresh token and store it in database"""
    token = secrets.token_urlsafe(64)
    expires_at = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    
    refresh_token = RefreshToken(
        token=token,
        user_id=user_id,
        expires_at=expires_at
    )
    
    refresh_tokens_collection.insert_one(refresh_token.model_dump(by_alias=True, exclude={"id"}))
    return token

def verify_token(token: str, expected_type: str = "access") -> Optional[dict]:
    """Verify JWT token with full claims validation"""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience="errandease-web",
            issuer="errandease-api",
            options={"require": ["exp", "iat", "nbf", "jti", "type"]}
        )
        
        if payload.get("type") != expected_type:
            logger.warning(f"Token type mismatch: expected {expected_type}, got {payload.get('type')}")
            return None
            
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.JWTError as e:
        logger.debug(f"JWT validation error: {e}")
        return None

async def get_google_tokens(code: str, redirect_uri: str):
    """Exchange authorization code for access token"""
    token_url = "https://oauth2.googleapis.com/token"
    
    data = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=data)
        
        if response.status_code != 200:
            logger.error(f"Token exchange failed: {response.status_code}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange code for tokens"
            )
        
        return response.json()

async def get_google_user_info(access_token: str) -> GoogleUserInfo:
    """Get user info from Google using access token"""
    userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
    
    headers = {"Authorization": f"Bearer {access_token}"}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(userinfo_url, headers=headers)
        
        if response.status_code != 200:
            logger.error(f"Failed to get user info: {response.status_code}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user info from Google"
            )
        
        user_data = response.json()
        
        if not user_data.get("email_verified"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google account email is not verified"
            )
        
        return GoogleUserInfo(
            email=user_data.get('email'),
            name=user_data.get('name'),
            picture=user_data.get('picture'),
            sub=user_data.get('sub'),
            email_verified=user_data.get('email_verified', False)
        )

@router.get("/google/url")
async def get_google_auth_url(request: Request, action: Optional[str] = None):
    """Get Google OAuth URL for frontend
    Actions:
    - signin: customer sign in
    - signup: customer sign up
    - agent-signin: agent sign in
    - agent-signup: agent sign up
    """
    
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"google_url:{client_ip}", max_requests=10):
        raise HTTPException(status_code=429, detail="Too many requests")
    
    # Generate state and store in a simple cache instead of session
    state = secrets.token_urlsafe(32)
    
    # Store state in memory with timestamp (in production, use Redis)
    rate_limit_store[f"state:{state}"] = {
        "action": action or "signin",
        "timestamp": datetime.utcnow().timestamp()
    }
    
    # Determine redirect URI based on action
    if settings.ENVIRONMENT == "production":
        # Production URLs
        if action == 'agent-signup':
            redirect_uri = f"{settings.FRONTEND_URL}/agent-signup.html"
        elif action == 'agent-signin':
            redirect_uri = f"{settings.FRONTEND_URL}/agent-signin.html"
        elif action == 'signup':
            redirect_uri = f"{settings.FRONTEND_URL}/sign-up.html"
        else:  # default to signin
            redirect_uri = f"{settings.FRONTEND_URL}/sign-in.html"
    else:
        # Development URLs
        if action == 'agent-signup':
            redirect_uri = f"{settings.FRONTEND_URL}/frontend/agent-signup.html"
        elif action == 'agent-signin':
            redirect_uri = f"{settings.FRONTEND_URL}/frontend/agent-signin.html"
        elif action == 'signup':
            redirect_uri = f"{settings.FRONTEND_URL}/frontend/sign-up.html"
        else:  # default to signin
            redirect_uri = f"{settings.FRONTEND_URL}/frontend/sign-in.html"
    
    # Log the redirect URI for debugging
    logger.info(f"OAuth request - Action: {action}, Redirect URI: {redirect_uri}")
    
    # Create OAuth client
    google_client = oauth.create_client('google')
    
    # Generate authorization URL
    auth_url_dict = await google_client.create_authorization_url(
        redirect_uri=redirect_uri,
        state=state
    )
    
    auth_url = auth_url_dict.get('url')
    return {"auth_url": auth_url}

@router.post("/google")
async def google_auth(
    payload: GoogleTokenRequest,
    request: Request,
):
    """Handle Google OAuth token exchange and return app tokens in response body."""

    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"google_auth:{client_ip}", max_requests=5):
        raise HTTPException(status_code=429, detail="Too many requests")

    if users_collection is None or refresh_tokens_collection is None:
        logger.error("Database not available")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )

    # Validate state from our memory cache
    state_key = f"state:{payload.state}"
    state_data = rate_limit_store.get(state_key)

    if not state_data:
        logger.warning("Invalid or expired OAuth state")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state"
        )

    # Check state age (5 minutes max)
    if datetime.utcnow().timestamp() - state_data.get("timestamp", 0) > 300:
        logger.warning("OAuth state expired")
        rate_limit_store.pop(state_key, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth state expired"
        )

    # Remove used state
    rate_limit_store.pop(state_key, None)

    try:
        # Determine redirect URI based on action
        action = state_data.get("action", "signin")

        if settings.ENVIRONMENT == "production":
            if action == "signup":
                redirect_uri = f"{settings.FRONTEND_URL}/sign-up.html"
            else:
                redirect_uri = f"{settings.FRONTEND_URL}/sign-in.html"
        else:
            if action == "signup":
                redirect_uri = f"{settings.FRONTEND_URL}/frontend/sign-up.html"
            else:
                redirect_uri = f"{settings.FRONTEND_URL}/frontend/sign-in.html"

        # Exchange code for Google tokens
        tokens = await get_google_tokens(payload.code, redirect_uri)
        google_access_token = tokens.get("access_token")

        if not google_access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No access token received from Google"
            )

        # Get user info from Google
        google_user = await get_google_user_info(google_access_token)

        # Check if user exists
        existing_user = users_collection.find_one({
            "$or": [
                {"google_id": google_user.sub},
                {"email": google_user.email}
            ]
        })

        is_new = False
        user_id = None
        username = None
        role = "customer"

        if existing_user:
            users_collection.update_one(
                {"_id": existing_user["_id"]},
                {
                    "$set": {
                        "google_id": google_user.sub,
                        "picture": google_user.picture,
                        "last_login": datetime.utcnow(),
                        "name": google_user.name
                    }
                }
            )
            user_id = str(existing_user["_id"])
            username = existing_user.get("username")
            role = existing_user.get("role", "customer")
            logger.info(f"Updated existing user: {google_user.email}")
        else:
            base_username = google_user.email.split("@")[0]
            username = base_username
            counter = 1

            while users_collection.find_one({"username": username}):
                username = f"{base_username}{counter}"
                counter += 1

            new_user = User(
                email=google_user.email,
                name=google_user.name,
                username=username,
                picture=google_user.picture,
                auth_identities=[
                    AuthIdentity(
                        provider="google",
                        provider_sub=google_user.sub
                    )
                ],
                role="customer",
                last_login=datetime.utcnow()
            )

            new_user_dict = new_user.model_dump(by_alias=True, exclude={"id"})
            new_user_dict = {
                k: v for k, v in new_user_dict.items() if v is not None
            }

            result = users_collection.insert_one(new_user_dict)
            user_id = str(result.inserted_id)
            is_new = True
            role = "customer"
            logger.info(f"Created new user: {google_user.email}")

        # Create app tokens
        jwt_token = create_access_token({
            "sub": user_id,
            "email": google_user.email,
            "name": google_user.name,
            "role": role,
        })

        refresh_token = create_refresh_token(user_id)

        # Prepare user response
        user_response = UserResponse(
            id=user_id,
            email=google_user.email,
            name=google_user.name,
            username=username,
            picture=google_user.picture,
            role=role,
            is_new=is_new
        )

        response_data = {
            "access_token": jwt_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": user_response.model_dump()
        }

        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

@router.post("/refresh")
async def refresh_token(refresh_token: str):
    """Refresh access token using refresh token"""
    
    if refresh_tokens_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    # Find refresh token in database
    token_doc = refresh_tokens_collection.find_one({
        "token": refresh_token,
        "revoked_at": None,
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    
    # Get user
    from bson.objectid import ObjectId
    user = users_collection.find_one({"_id": ObjectId(token_doc["user_id"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Create new access token
    new_access_token = create_access_token({
        "sub": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"]
    })
    
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }

@router.get("/me")
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from Authorization header"""
    
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    token = credentials.credentials
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    from bson.objectid import ObjectId
    user_id = payload.get("sub")
    
    try:
        user = users_collection.find_one({"_id": ObjectId(user_id)})
    except:
        raise HTTPException(status_code=401, detail="Invalid user ID")
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=str(user['_id']),
        email=user['email'],
        name=user.get('name', ''),
        username=user.get('username'),
        picture=user.get('picture'),
        role=user.get('role', 'customer'),
        is_new=False
    )

@router.post("/logout")
async def logout(refresh_token: str):
    """Logout - revoke refresh token"""
    
    if refresh_tokens_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    # Revoke refresh token in database
    refresh_tokens_collection.update_one(
        {"token": refresh_token},
        {"$set": {"revoked_at": datetime.utcnow()}}
    )
    
    return {"message": "Logged out successfully"}

@router.post("/google/agent")
async def google_agent_auth(
    payload: GoogleTokenRequest,
    request: Request,
    agent_data: Optional[AgentSignupRequest] = None
):
    """
    Google OAuth specifically for agent signup/signin
    Ensures users signing up as agents get role="agent"
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"google_agent_auth:{client_ip}", max_requests=5):
        raise HTTPException(status_code=429, detail="Too many requests")

    if users_collection is None or refresh_tokens_collection is None:
        logger.error("Database not available")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )

    # Validate state from our memory cache
    state_key = f"state:{payload.state}"
    state_data = rate_limit_store.get(state_key)

    if not state_data:
        logger.warning("Invalid or expired OAuth state")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state"
        )

    # Check state age (5 minutes max)
    if datetime.utcnow().timestamp() - state_data.get("timestamp", 0) > 300:
        logger.warning("OAuth state expired")
        rate_limit_store.pop(state_key, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth state expired"
        )

    # Remove used state
    rate_limit_store.pop(state_key, None)

    try:
        # Determine redirect URI based on action - CRITICAL FIX
        action = state_data.get("action", "agent-signin")

        if settings.ENVIRONMENT == "production":
            if action == "agent-signup":
                redirect_uri = f"{settings.FRONTEND_URL}/agent-signup.html"
            else:
                redirect_uri = f"{settings.FRONTEND_URL}/agent-signin.html"
        else:
            if action == "agent-signup":
                redirect_uri = f"{settings.FRONTEND_URL}/frontend/agent-signup.html"
            else:
                redirect_uri = f"{settings.FRONTEND_URL}/frontend/agent-signin.html"

        # Exchange code for Google tokens
        tokens = await get_google_tokens(payload.code, redirect_uri)
        google_access_token = tokens.get("access_token")

        if not google_access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No access token received from Google"
            )

        # Get user info from Google
        google_user = await get_google_user_info(google_access_token)

        # Check if user exists
        existing_user = users_collection.find_one({
            "$or": [
                {"google_id": google_user.sub},
                {"email": google_user.email}
            ]
        })

        is_new = False
        user_id = None
        username = None
        role = "agent"  # Force agent role for this endpoint

        if existing_user:
            # Check if user is already an agent or we're promoting them
            current_role = existing_user.get("role", "customer")
            
            # Security: Only allow role change if explicitly approved
            # For now, we'll allow users to become agents
            # In production, this might require admin approval
            
            users_collection.update_one(
                {"_id": existing_user["_id"]},
                {
                    "$set": {
                        "google_id": google_user.sub,
                        "picture": google_user.picture,
                        "last_login": datetime.utcnow(),
                        "name": google_user.name,
                        "role": "agent"  # Upgrade to agent
                    }
                }
            )
            user_id = str(existing_user["_id"])
            username = existing_user.get("username")
            logger.info(f"Updated existing user to agent: {google_user.email}")
        else:
            base_username = google_user.email.split("@")[0]
            username = base_username
            counter = 1

            while users_collection.find_one({"username": username}):
                username = f"{base_username}{counter}"
                counter += 1

            new_user = User(
                email=google_user.email,
                name=google_user.name,
                username=username,
                picture=google_user.picture,
                auth_identities=[
                    AuthIdentity(
                        provider="google",
                        provider_sub=google_user.sub
                    )
                ],
                role="agent",  # New users become agents
                last_login=datetime.utcnow()
            )

            new_user_dict = new_user.model_dump(by_alias=True, exclude={"id"})
            new_user_dict = {
                k: v for k, v in new_user_dict.items() if v is not None
            }

            result = users_collection.insert_one(new_user_dict)
            user_id = str(result.inserted_id)
            is_new = True
            logger.info(f"Created new agent: {google_user.email}")

        # Create app tokens
        jwt_token = create_access_token({
            "sub": user_id,
            "email": google_user.email,
            "name": google_user.name,
            "role": "agent",  # Ensure role is agent in JWT
        })

        refresh_token = create_refresh_token(user_id)

        # Prepare user response
        user_response = UserResponse(
            id=user_id,
            email=google_user.email,
            name=google_user.name,
            username=username,
            picture=google_user.picture,
            role="agent",  # Ensure role is agent in response
            is_new=is_new
        )

        response_data = {
            "access_token": jwt_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": user_response.model_dump()
        }

        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google agent auth error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )