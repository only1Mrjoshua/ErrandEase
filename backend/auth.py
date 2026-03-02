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
import httpx
import os

from config import settings
from database import users_collection

# Create router
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# Print all settings at startup for debugging
print("="*50)
print("AUTH MODULE INITIALIZING")
print(f"ENVIRONMENT: {settings.ENVIRONMENT}")
print(f"GOOGLE_CLIENT_ID: {settings.GOOGLE_CLIENT_ID[:10]}...")
print(f"GOOGLE_REDIRECT_URI: {settings.GOOGLE_REDIRECT_URI}")
print(f"FRONTEND_URL: {settings.FRONTEND_URL}")
print("="*50)

# OAuth setup with explicit configuration
oauth = OAuth()
oauth.register(
    name='google',
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile',
        'prompt': 'select_account'  # Force account selection
    }
)

# JWT functions (keep as is)
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

# COMPLETELY REWRITTEN LOGIN ROUTE
@router.get("/google/login")
async def google_login(request: Request, redirect_to: Optional[str] = None):
    """Redirect to Google OAuth consent screen"""
    print("\n" + "="*50)
    print("GOOGLE LOGIN CALLED")
    print(f"Request URL: {request.url}")
    print(f"Redirect to param: {redirect_to}")
    
    try:
        # Store the page user wanted to go to
        if redirect_to:
            request.session['requested_page'] = redirect_to
            print(f"Stored requested_page: {redirect_to}")
        
        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)
        request.session['oauth_state'] = state
        print(f"Generated state: {state}")
        print(f"Session after setting: {dict(request.session)}")
        
        # Get the authorization URL manually to see what's happening
        google_client = oauth.create_client('google')
        if not google_client:
            raise Exception("Failed to create Google client")
        
        # Manually construct the authorization URL
        authorization_url = await google_client.create_authorization_url(
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            state=state
        )
        
        print(f"Authorization URL created: {authorization_url}")
        
        # Use the standard method
        redirect_response = await google_client.authorize_redirect(
            request,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            state=state
        )
        
        print(f"Redirect response headers: {redirect_response.headers}")
        redirect_location = redirect_response.headers.get('location')
        print(f"Redirect location: {redirect_location}")
        
        # Verify it's Google's domain
        if redirect_location and 'accounts.google.com' in redirect_location:
            print("✅ Redirecting to Google accounts")
        else:
            print("❌ Something wrong with redirect URL")
        
        return redirect_response
        
    except Exception as e:
        print(f"❌ Google login error: {str(e)}")
        import traceback
        traceback.print_exc()
        error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Login+failed"
        return RedirectResponse(url=error_url)

# COMPLETELY REWRITTEN CALLBACK ROUTE
@router.get("/google/callback")
async def google_callback(request: Request):
    print("\n" + "="*50)
    print("GOOGLE CALLBACK RECEIVED")
    print(f"Full URL: {request.url}")
    print(f"Query params: {dict(request.query_params)}")
    print(f"Session: {dict(request.session)}")
    print(f"Headers: {dict(request.headers)}")
    
    try:
        # Get state from query params
        received_state = request.query_params.get('state')
        code = request.query_params.get('code')
        error = request.query_params.get('error')
        
        print(f"Received state: {received_state}")
        print(f"Received code: {code[:20] if code else 'None'}...")
        print(f"Error param: {error}")
        
        # Check for Google error
        if error:
            print(f"Google returned error: {error}")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Google+auth+failed"
            return RedirectResponse(url=error_url)
        
        # Verify state
        expected_state = request.session.get('oauth_state')
        print(f"Expected state from session: {expected_state}")
        
        if not expected_state or not received_state:
            print("❌ Missing state parameter")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Missing+state"
            return RedirectResponse(url=error_url)
        
        if expected_state != received_state:
            print(f"❌ State mismatch")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Invalid+state"
            return RedirectResponse(url=error_url)
        
        # Clear state from session
        request.session.pop('oauth_state', None)
        print("✅ State validated and cleared")
        
        if not code:
            print("❌ No authorization code received")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=No+code"
            return RedirectResponse(url=error_url)
        
        # Exchange code for token
        print("🔄 Exchanging code for token...")
        
        # Manually exchange token to see what's happening
        google_client = oauth.create_client('google')
        
        # Get token manually
        token = await google_client.fetch_access_token(
            code=code,
            redirect_uri=settings.GOOGLE_REDIRECT_URI
        )
        
        print(f"✅ Token received: {list(token.keys())}")
        
        # Get user info
        print("🔄 Fetching user info...")
        
        # Try both endpoints to be safe
        try:
            # Method 1: Using the built-in method
            resp = await google_client.get('userinfo', token=token)
            if resp.status_code == 200:
                user_info = resp.json()
                print(f"✅ Got user info via userinfo endpoint: {user_info.get('email')}")
            else:
                # Method 2: Try the explicit endpoint
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        'https://www.googleapis.com/oauth2/v3/userinfo',
                        headers={'Authorization': f'Bearer {token["access_token"]}'}
                    )
                    if resp.status_code == 200:
                        user_info = resp.json()
                        print(f"✅ Got user info via explicit endpoint: {user_info.get('email')}")
                    else:
                        raise Exception(f"Failed to get user info: {resp.status_code}")
        except Exception as e:
            print(f"❌ Error getting user info: {e}")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=User+info+failed"
            return RedirectResponse(url=error_url)
        
        # Extract user data
        google_id = user_info.get('sub')
        email = user_info.get('email')
        name = user_info.get('name')
        picture = user_info.get('picture')
        
        print(f"User data - ID: {google_id}, Email: {email}, Name: {name}")
        
        if not email:
            print("❌ No email in user info")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=No+email"
            return RedirectResponse(url=error_url)
        
        # Database operations (keep as is)
        existing_user = users_collection.find_one({"email": email})
        
        if existing_user:
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
            print(f"🔄 Updated existing user: {email}")
        else:
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
            print(f"🆕 Created new user: {email}")
        
        # Create JWT
        access_token = create_access_token(
            data={"sub": user_id, "email": email, "name": name}
        )
        
        # Determine redirect
        if is_new_user:
            redirect_url = f"{settings.FRONTEND_URL}/sign-up.html?token={access_token}"
        else:
            redirect_url = f"{settings.FRONTEND_URL}/sign-in.html?token={access_token}"
        
        print(f"✅ Authentication successful")
        print(f"➡️ Redirecting to: {redirect_url}")
        
        response = RedirectResponse(url=redirect_url)
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
        print(f"❌ Callback error: {str(e)}")
        import traceback
        traceback.print_exc()
        error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=Auth+failed"
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