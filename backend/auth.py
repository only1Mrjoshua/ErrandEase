# auth.py - TOKEN EXCHANGE PATTERN VERSION
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import RedirectResponse, JSONResponse
from authlib.integrations.starlette_client import OAuth
from datetime import datetime, timedelta
from jose import jwt
import secrets
from typing import Optional
from pydantic import BaseModel
import httpx
import os
import json
import string

from config import settings
from database import users_collection

router = APIRouter(prefix="/api/auth", tags=["authentication"])

# Print ALL settings at startup
print("\n" + "="*60)
print("🔍 DIAGNOSTIC MODE - CHECKING ALL SETTINGS")
print("="*60)
print(f"ENVIRONMENT: {settings.ENVIRONMENT}")
print(f"FRONTEND_URL: {settings.FRONTEND_URL}")
print(f"GOOGLE_REDIRECT_URI: {settings.GOOGLE_REDIRECT_URI}")
print(f"GOOGLE_CLIENT_ID: {settings.GOOGLE_CLIENT_ID[:10]}...{settings.GOOGLE_CLIENT_ID[-10:]}")
print(f"JWT_ALGORITHM: {settings.JWT_ALGORITHM}")
print("="*60 + "\n")

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

# User model
class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None

# Request model for token exchange
class GoogleTokenRequest(BaseModel):
    code: str

# User info model
class GoogleUserInfo(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None
    sub: str

def generate_random_password(length=16):
    """Generate a random password for Google OAuth users"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    if not any(c.isupper() for c in password):
        password += 'A'
    if not any(c.islower() for c in password):
        password += 'a'
    if not any(c.isdigit() for c in password):
        password += '1'
    return password

async def get_google_tokens(code: str, redirect_uri: str):
    """Exchange authorization code for access token"""
    print(f"🔄 Exchanging code for tokens with Google...")
    print(f"📤 Using redirect_uri: {redirect_uri}")
    token_url = "https://oauth2.googleapis.com/token"
    
    data = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,  # This MUST match the one used in auth request
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=data)
        
        if response.status_code != 200:
            print(f"❌ Token exchange failed: {response.status_code} - {response.text}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange code for tokens"
            )
        
        tokens = response.json()
        print(f"✅ Token exchange successful, access_token received: {bool(tokens.get('access_token'))}")
        return tokens

async def get_google_user_info(access_token: str):
    """Get user info from Google using access token"""
    print(f"🔄 Getting user info from Google...")
    userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(userinfo_url, headers=headers)
        
        if response.status_code != 200:
            print(f"❌ Failed to get user info: {response.status_code} - {response.text}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user info from Google"
            )
        
        user_data = response.json()
        print(f"✅ User info received: {user_data.get('email')} - {user_data.get('name')}")
        return user_data

@router.get("/google/url")
async def get_google_auth_url(request: Request, action: Optional[str] = None):
    """Get Google OAuth URL for frontend"""
    print(f"🔗 Generating Google auth URL for action: {action}")
    print(f"🎯 Frontend URL from settings: {settings.FRONTEND_URL}")
    print(f"🌍 Environment: {settings.ENVIRONMENT}")
    
    # Generate state
    state = secrets.token_urlsafe(32)
    
    # Determine redirect URI based on environment
    if settings.ENVIRONMENT == "production":
        # Production: no /frontend/ folder
        if action == 'signup':
            redirect_uri = f"{settings.FRONTEND_URL}/sign-up.html"
        else:
            redirect_uri = f"{settings.FRONTEND_URL}/sign-in.html"
    else:
        # Development: with /frontend/ folder
        if action == 'signup':
            redirect_uri = f"{settings.FRONTEND_URL}/frontend/sign-up.html"
        else:
            redirect_uri = f"{settings.FRONTEND_URL}/frontend/sign-in.html"
    
    print(f"🔄 Using redirect URI: {redirect_uri}")
    
    # Store in session
    request.session['oauth_state'] = state
    request.session['oauth_redirect_uri'] = redirect_uri
    if action:
        request.session['oauth_action'] = action
    
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
async def google_auth(request: GoogleTokenRequest, fastapi_request: Request):
    """Handle Google OAuth token exchange - return token in response body"""
    
    # Add a simple cache to prevent duplicate processing
    if hasattr(fastapi_request.app.state, 'processed_codes'):
        if request.code in fastapi_request.app.state.processed_codes:
            print(f"⚠️ Code already processed, returning cached result")
            return fastapi_request.app.state.processed_codes[request.code]
    else:
        fastapi_request.app.state.processed_codes = {}
    
    try:
        print(f"🔍 Starting Google OAuth POST processing...")
        
        # Get redirect URI from session or determine based on environment
        stored_redirect_uri = fastapi_request.session.get('oauth_redirect_uri')
        
        if stored_redirect_uri:
            redirect_uri = stored_redirect_uri
            print(f"📤 Using stored redirect_uri from session: {redirect_uri}")
        else:
            # Fallback: construct based on environment and action
            action = fastapi_request.session.get('oauth_action', 'signin')
            
            if settings.ENVIRONMENT == "production":
                if action == 'signup':
                    redirect_uri = f"{settings.FRONTEND_URL}/sign-up.html"
                else:
                    redirect_uri = f"{settings.FRONTEND_URL}/sign-in.html"
            else:
                if action == 'signup':
                    redirect_uri = f"{settings.FRONTEND_URL}/frontend/sign-up.html"
                else:
                    redirect_uri = f"{settings.FRONTEND_URL}/frontend/sign-in.html"
            
            print(f"📤 Using constructed redirect_uri: {redirect_uri}")
        
        # Exchange code for tokens - PASS THE REDIRECT_URI
        tokens = await get_google_tokens(request.code, redirect_uri)
        access_token = tokens.get("access_token")
        
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No access token received from Google"
            )
        
        # Get user info from Google
        user_data = await get_google_user_info(access_token)
        
        # Create GoogleUserInfo object
        google_user = GoogleUserInfo(
            email=user_data.get('email'),
            name=user_data.get('name'),
            picture=user_data.get('picture'),
            sub=user_data.get('sub')
        )
        
        # Check if user exists in database
        existing_user = users_collection.find_one({"email": google_user.email})
        
        if existing_user:
            # Update existing user
            users_collection.update_one(
                {"email": google_user.email},
                {"$set": {
                    "google_id": google_user.sub,
                    "picture": google_user.picture,
                    "last_login": datetime.utcnow()
                }}
            )
            user_id = str(existing_user['_id'])
            is_new = False
            print(f"🔄 Updated existing user: {google_user.email}")
        else:
            # Create new user
            random_password = generate_random_password()
            
            # Create username from email
            base_username = google_user.email.split('@')[0]
            username = base_username
            
            # Ensure username is unique
            counter = 1
            while users_collection.find_one({"username": username}):
                username = f"{base_username}{counter}"
                counter += 1
            
            new_user = {
                "email": google_user.email,
                "name": google_user.name,
                "username": username,
                "google_id": google_user.sub,
                "picture": google_user.picture,
                "password": random_password,  # You should hash this
                "role": "customer",  # Default role
                "created_at": datetime.utcnow(),
                "last_login": datetime.utcnow()
            }
            result = users_collection.insert_one(new_user)
            user_id = str(result.inserted_id)
            is_new = True
            print(f"🆕 Created new user: {google_user.email} with username: {username}")
        
        # Create JWT token
        jwt_token = create_access_token(
            data={"sub": user_id, "email": google_user.email, "name": google_user.name}
        )
        print(f"🔑 JWT token created for user: {google_user.email}")
        
        # Prepare result
        result = {
            "access_token": jwt_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": {
                "id": user_id,
                "email": google_user.email,
                "name": google_user.name,
                "picture": google_user.picture,
                "is_new": is_new,
                "role": "customer"  # Default role
            }
        }
        
        # Cache the result
        fastapi_request.app.state.processed_codes[request.code] = result
        
        # Clear session data
        if 'oauth_state' in fastapi_request.session:
            del fastapi_request.session['oauth_state']
        if 'oauth_redirect_uri' in fastapi_request.session:
            del fastapi_request.session['oauth_redirect_uri']
        if 'oauth_action' in fastapi_request.session:
            del fastapi_request.session['oauth_action']
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Google auth error: {e}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

# Keep your existing JWT functions
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.JWTError:
        return None

@router.get("/verify")
async def verify_user(token: str):
    """Verify JWT token and return user info"""
    try:
        payload = verify_token(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        from bson.objectid import ObjectId
        user_id = payload.get("sub")
        
        try:
            user = users_collection.find_one({"_id": ObjectId(user_id)})
        except:
            user = users_collection.find_one({"email": payload.get("email")})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserResponse(
            id=str(user['_id']),
            email=user['email'],
            name=user.get('name', ''),
            picture=user.get('picture')
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Token verification error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/logout")
async def logout():
    """Logout endpoint"""
    return JSONResponse({
        "message": "Logged out successfully",
        "redirect": settings.FRONTEND_URL
    })

# Keep the old endpoints for backward compatibility (optional)
@router.get("/google/login")
async def google_login_redirect(request: Request):
    """Legacy endpoint - redirects to new pattern info"""
    return JSONResponse({
        "message": "Please use GET /api/auth/google/url to get the auth URL, then POST /api/auth/google with the code",
        "new_endpoints": {
            "get_url": "/api/auth/google/url",
            "exchange_token": "/api/auth/google (POST)"
        }
    })

@router.get("/google/callback")
async def google_callback_legacy():
    """Legacy endpoint - returns error with instructions"""
    return JSONResponse({
        "error": "This endpoint is not used in the token exchange pattern",
        "message": "Please use GET /api/auth/google/url to get the auth URL, then POST /api/auth/google with the code"
    }, status_code=400)