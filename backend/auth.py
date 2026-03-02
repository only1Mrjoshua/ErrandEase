# auth.py
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from authlib.integrations.starlette_client import OAuth
from datetime import datetime, timedelta
from jose import jwt
import secrets
from typing import Optional
from pydantic import BaseModel
import httpx

from config import settings
from database import users_collection

# Create router
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# Print settings for debugging
print(f"🌍 Auth module loaded - Environment: {settings.ENVIRONMENT}")
print(f"📡 Redirect URI: {settings.GOOGLE_REDIRECT_URI}")
print(f"🎨 Frontend URL: {settings.FRONTEND_URL}")

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

# FIXED: Added the missing verify_token function
def verify_token(token: str):
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET_KEY, 
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        print("Token expired")
        return None
    except jwt.JWTError as e:
        print(f"Token verification error: {e}")
        return None

# User model
class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None

# SIMPLIFIED LOGIN ROUTE
@router.get("/google/login")
async def google_login(request: Request):
    """Redirect to Google OAuth consent screen"""
    print(f"\n🚀 Google login called")
    
    try:
        # Generate state
        state = secrets.token_urlsafe(32)
        request.session['oauth_state'] = state
        print(f"🔐 State stored in session: {state}")
        
        # Create OAuth client
        google_client = oauth.create_client('google')
        
        # Redirect to Google
        redirect_response = await google_client.authorize_redirect(
            request,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            state=state
        )
        
        redirect_url = redirect_response.headers.get('location')
        print(f"➡️ Redirecting to: {redirect_url}")
        
        return redirect_response
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/sign-up.html?error=login_failed")

# SIMPLIFIED CALLBACK ROUTE
@router.get("/google/callback")
async def google_callback(request: Request):
    print(f"\n📞 Google callback received")
    print(f"URL: {request.url}")
    print(f"Params: {dict(request.query_params)}")
    
    try:
        # Get parameters
        code = request.query_params.get('code')
        received_state = request.query_params.get('state')
        error = request.query_params.get('error')
        
        # Check for error
        if error:
            print(f"❌ Google returned error: {error}")
            return RedirectResponse(url=f"{settings.FRONTEND_URL}/sign-up.html?error=google_error")
        
        # Validate state
        expected_state = request.session.get('oauth_state')
        print(f"Expected state: {expected_state}")
        print(f"Received state: {received_state}")
        
        if not expected_state or not received_state or expected_state != received_state:
            print("❌ State validation failed")
            return RedirectResponse(url=f"{settings.FRONTEND_URL}/sign-up.html?error=invalid_state")
        
        # Clear state
        request.session.pop('oauth_state', None)
        
        # Exchange code for token
        print("🔄 Exchanging code for token...")
        google_client = oauth.create_client('google')
        token = await google_client.fetch_access_token(
            code=code,
            redirect_uri=settings.GOOGLE_REDIRECT_URI
        )
        print(f"✅ Token obtained")
        
        # Get user info
        print("🔄 Getting user info...")
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {token["access_token"]}'}
            )
            
            if resp.status_code != 200:
                print(f"❌ Failed to get user info: {resp.status_code}")
                return RedirectResponse(url=f"{settings.FRONTEND_URL}/sign-up.html?error=userinfo_failed")
            
            user_info = resp.json()
            print(f"✅ Got user info for: {user_info.get('email')}")
        
        # Extract user data
        email = user_info.get('email')
        name = user_info.get('name')
        picture = user_info.get('picture')
        google_id = user_info.get('sub')
        
        if not email:
            print("❌ No email in user info")
            return RedirectResponse(url=f"{settings.FRONTEND_URL}/sign-up.html?error=no_email")
        
        # Database operations
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
            is_new = False
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
            is_new = True
            print(f"🆕 Created new user: {email}")
        
        # Create JWT
        access_token = create_access_token(
            data={"sub": user_id, "email": email, "name": name}
        )
        
        # Redirect based on user type
        if is_new:
            redirect_url = f"{settings.FRONTEND_URL}/frontend/sign-up.html?token={access_token}"
        else:
            redirect_url = f"{settings.FRONTEND_URL}/frontend/sign-in.html?token={access_token}"
        
        print(f"✅ Success! Redirecting to: {redirect_url}")
        
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
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/sign-up.html?error=auth_failed")

# FIXED: verify route using the verify_token function
@router.get("/verify")
async def verify_user(token: str):
    """Verify JWT token and return user info"""
    try:
        # Use the verify_token function
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