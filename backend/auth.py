# auth.py
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from authlib.integrations.starlette_client import OAuth
from starlette.config import Config
from datetime import datetime, timedelta
from jose import jwt
import secrets
from typing import Optional
from pydantic import BaseModel

from config import settings
from database import users_collection

# Create router
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# OAuth setup
oauth = OAuth()
oauth.register(
    name='google',
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        'redirect_uri': settings.GOOGLE_REDIRECT_URI
    }
)

# JWT functions
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
    except jwt.JWTError:
        return None

# User model
class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None

# Routes
@router.get("/google/login")
async def google_login(request: Request):
    """Redirect to Google OAuth consent screen"""
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    
    # Generate and store state parameter for CSRF protection
    state = secrets.token_urlsafe(32)
    request.session['oauth_state'] = state
    
    return await oauth.google.authorize_redirect(request, redirect_uri, state=state)

@router.get("/google/callback")
async def google_callback(request: Request):
    """Handle Google OAuth callback"""
    try:
        # Verify state parameter for CSRF protection
        expected_state = request.session.get('oauth_state')
        if not expected_state or expected_state != request.query_params.get('state'):
            raise HTTPException(status_code=400, detail="Invalid state parameter")
        
        # Get token from Google
        token = await oauth.google.authorize_access_token(request)
        
        # Get user info from Google's userinfo endpoint
        resp = await oauth.google.get('https://www.googleapis.com/oauth2/v3/userinfo', token=token)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")
        
        user_info = resp.json()
        
        # Extract user data
        google_id = user_info.get('sub')
        email = user_info.get('email')
        name = user_info.get('name')
        picture = user_info.get('picture')
        
        # Check if user exists in database
        existing_user = users_collection.find_one({"email": email})
        
        if existing_user:
            # Update existing user
            users_collection.update_one(
                {"email": email},
                {"$set": {
                    "google_id": google_id,
                    "picture": picture,
                    "last_login": datetime.utcnow()
                }}
            )
            user_id = str(existing_user['_id'])
        else:
            # Create new user
            new_user = {
                "email": email,
                "name": name,
                "google_id": google_id,
                "picture": picture,
                "created_at": datetime.utcnow(),
                "last_login": datetime.utcnow()
            }
            result = users_collection.insert_one(new_user)
            user_id = str(result.inserted_id)
        
        # Create JWT token
        access_token = create_access_token(
            data={
                "sub": user_id,
                "email": email,
                "name": name
            }
        )
        
        # FIX: Try different path variations for the dashboard
        # Option 1: Direct path (if frontend is served from root)
        redirect_url = f"{settings.FRONTEND_URL}/customer-dashboard.html?token={access_token}"
        
        # Option 2: With /frontend prefix (uncomment if needed)
        redirect_url = f"{settings.FRONTEND_URL}/frontend/customer-dashboard.html?token={access_token}"
        
        # Clear session
        request.session.pop('oauth_state', None)
        
        print(f"Redirecting to: {redirect_url}")  # Debug log
        return RedirectResponse(url=redirect_url)
        
    except Exception as e:
        print(f"OAuth callback error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # FIX: Redirect to signup page with error
        error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Authentication+failed"
        return RedirectResponse(url=error_url)
    
@router.get("/google/login")
async def google_login(request: Request, redirect_to: Optional[str] = None):
    """Redirect to Google OAuth consent screen with optional redirect"""
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    
    # Store the page user wanted to go to
    if redirect_to:
        request.session['requested_page'] = redirect_to
    
    # Generate and store state parameter for CSRF protection
    state = secrets.token_urlsafe(32)
    request.session['oauth_state'] = state
    
    return await oauth.google.authorize_redirect(request, redirect_uri, state=state)

@router.get("/verify")
async def verify_user(token: str):
    """Verify JWT token and return user info"""
    try:
        payload = verify_token(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        # Get user from database using the sub (user_id) from token
        from bson.objectid import ObjectId
        user_id = payload.get("sub")
        
        try:
            # Convert string ID to ObjectId for MongoDB query
            user = users_collection.find_one({"_id": ObjectId(user_id)})
        except:
            # If ID is not a valid ObjectId, try finding by email as fallback
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