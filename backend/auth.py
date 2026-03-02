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
from urllib.parse import quote

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
        'scope': 'openid email profile'
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

# Routes - FIXED VERSION
@router.get("/google/login")
async def google_login(request: Request, redirect_to: Optional[str] = None):
    """Redirect to Google OAuth consent screen with optional redirect"""
    try:
        print(f"🚀 Starting Google login. Environment: {settings.ENVIRONMENT}")
        print(f"📡 Redirect URI: {settings.GOOGLE_REDIRECT_URI}")
        print(f"🎨 Frontend URL: {settings.FRONTEND_URL}")
        
        # Store the page user wanted to go to
        if redirect_to:
            request.session['requested_page'] = redirect_to
        
        # Generate and store state parameter for CSRF protection
        state = secrets.token_urlsafe(32)
        request.session['oauth_state'] = state
        print(f"🔐 Generated state: {state}")
        
        # IMPORTANT: Pass the redirect_uri as a parameter, not in client_kwargs
        # This ensures Google redirects back to your backend callback
        redirect_response = await oauth.google.authorize_redirect(
            request, 
            redirect_uri=settings.GOOGLE_REDIRECT_URI,  # Make sure this parameter is named correctly
            state=state
        )
        
        print(f"➡️ Redirecting to Google: {redirect_response.headers.get('location')}")
        return redirect_response
        
    except Exception as e:
        print(f"❌ Google login error: {str(e)}")
        import traceback
        traceback.print_exc()
        # Redirect to frontend with error
        error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Login+initiation+failed"
        return RedirectResponse(url=error_url)

@router.get("/google/callback")
async def google_callback(request: Request):
    print(f"🔍 Callback received")
    print(f"🌍 Environment: {settings.ENVIRONMENT}")
    print(f"📝 Full callback URL: {request.url}")
    print(f"📝 Query params: {dict(request.query_params)}")
    
    try:
        # Verify state parameter for CSRF protection
        expected_state = request.session.get('oauth_state')
        received_state = request.query_params.get('state')
        
        print(f"🔐 Expected state: {expected_state}")
        print(f"🔐 Received state: {received_state}")
        
        # Validate state parameter
        if not expected_state or not received_state:
            print("❌ Missing state parameter")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Missing+state+parameter"
            return RedirectResponse(url=error_url)
        
        if expected_state != received_state:
            print(f"❌ State mismatch")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Invalid+state+parameter"
            return RedirectResponse(url=error_url)
        
        # Clear state from session
        request.session.pop('oauth_state', None)
        
        # Get token from Google
        print("🔄 Getting access token from Google...")
        token = await oauth.google.authorize_access_token(request)
        print(f"✅ Got token: {list(token.keys()) if token else 'None'}")
        
        # Get user info
        print("🔄 Getting user info from Google...")
        userinfo_response = await oauth.google.get('userinfo', token=token)
        
        if userinfo_response.status_code != 200:
            print(f"❌ Failed to get user info: {userinfo_response.status_code}")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Failed+to+get+user+info"
            return RedirectResponse(url=error_url)
        
        user_info = userinfo_response.json()
        print(f"✅ Got user info for: {user_info.get('email')}")
        
        # Extract user data
        google_id = user_info.get('sub')
        email = user_info.get('email')
        name = user_info.get('name')
        picture = user_info.get('picture')
        
        if not email:
            print("❌ No email in user info")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=No+email+from+Google"
            return RedirectResponse(url=error_url)
        
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
            is_new_user = False
            print(f"🔄 Existing user: {email}")
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
            is_new_user = True
            print(f"🆕 New user created: {email}")
        
        # Create JWT token
        access_token = create_access_token(
            data={
                "sub": user_id,
                "email": email,
                "name": name
            }
        )
        
        # Determine redirect based on user type
        if is_new_user:
            redirect_url = f"{settings.FRONTEND_URL}/sign-up.html?token={access_token}"
        else:
            redirect_url = f"{settings.FRONTEND_URL}/sign-in.html?token={access_token}"
        
        print(f"✅ Authentication successful")
        print(f"➡️ Redirecting to: {redirect_url}")
        
        # Create response with redirect
        response = RedirectResponse(url=redirect_url)
        
        # Also set a cookie for good measure
        response.set_cookie(
            key="auth_token",
            value=access_token,
            httponly=True,
            max_age=3600,
            secure=settings.ENVIRONMENT == "production",
            samesite="lax"
        )
        
        return response
        
    except Exception as e:
        print(f"❌ OAuth callback error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Authentication+failed"
        return RedirectResponse(url=error_url)

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