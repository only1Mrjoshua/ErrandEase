# auth.py - DIAGNOSTIC VERSION
from fastapi import APIRouter, Request, HTTPException
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

@router.get("/google/login")
async def google_login(request: Request):
    """Redirect to Google OAuth consent screen"""
    print("\n" + "="*60)
    print("🚀 GOOGLE LOGIN CALLED")
    print("="*60)
    print(f"Request URL: {request.url}")
    print(f"Request headers: {dict(request.headers)}")
    print(f"Session before: {dict(request.session)}")
    
    try:
        # Generate state
        state = secrets.token_urlsafe(32)
        request.session['oauth_state'] = state
        print(f"✅ Generated state: {state}")
        print(f"✅ Session after setting: {dict(request.session)}")
        
        # Create OAuth client
        google_client = oauth.create_client('google')
        
        # Get the authorization URL
        auth_url = await google_client.create_authorization_url(
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            state=state
        )
        print(f"✅ Auth URL created: {auth_url}")
        
        # Redirect to Google
        redirect_response = await google_client.authorize_redirect(
            request,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            state=state
        )
        
        redirect_location = redirect_response.headers.get('location')
        print(f"➡️ Redirecting to: {redirect_location}")
        
        # Verify it's going to Google
        if 'accounts.google.com' in redirect_location:
            print("✅ Destination: Google Accounts (correct)")
        else:
            print("❌ Destination: NOT Google! Wrong!")
        
        return redirect_response
        
    except Exception as e:
        print(f"❌ ERROR in google_login: {str(e)}")
        import traceback
        traceback.print_exc()
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/sign-up.html?error=login_failed")

@router.get("/google/callback")
async def google_callback(request: Request):
    print("\n" + "="*60)
    print("📞 GOOGLE CALLBACK RECEIVED")
    print("="*60)
    print(f"Full URL: {request.url}")
    print(f"Query params: {dict(request.query_params)}")
    print(f"Session: {dict(request.session)}")
    print(f"Headers: {dict(request.headers)}")
    
    try:
        # Get parameters
        code = request.query_params.get('code')
        received_state = request.query_params.get('state')
        error = request.query_params.get('error')
        
        print(f"📦 Code: {code[:20] if code else 'None'}...")
        print(f"🔐 Received state: {received_state}")
        print(f"⚠️ Error param: {error}")
        
        # Check for error
        if error:
            print(f"❌ Google returned error: {error}")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=google_{error}"
            print(f"➡️ Redirecting to error: {error_url}")
            return RedirectResponse(url=error_url)
        
        # Validate state
        expected_state = request.session.get('oauth_state')
        print(f"🔐 Expected state from session: {expected_state}")
        
        if not expected_state or not received_state:
            print("❌ Missing state parameter")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=missing_state"
            return RedirectResponse(url=error_url)
        
        if expected_state != received_state:
            print(f"❌ State mismatch")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=invalid_state"
            return RedirectResponse(url=error_url)
        
        print("✅ State validation passed")
        request.session.pop('oauth_state', None)
        
        if not code:
            print("❌ No authorization code")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=no_code"
            return RedirectResponse(url=error_url)
        
        # Exchange code for token
        print("🔄 Exchanging code for token...")
        google_client = oauth.create_client('google')
        
        try:
            token = await google_client.fetch_access_token(
                code=code,
                redirect_uri=settings.GOOGLE_REDIRECT_URI
            )
            print(f"✅ Token received: {list(token.keys())}")
            print(f"✅ Access token: {token.get('access_token', '')[:20]}...")
        except Exception as e:
            print(f"❌ Token exchange failed: {str(e)}")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=token_exchange"
            return RedirectResponse(url=error_url)
        
        # Get user info
        print("🔄 Getting user info...")
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    headers={'Authorization': f'Bearer {token["access_token"]}'}
                )
                
                print(f"📡 Userinfo response status: {resp.status_code}")
                
                if resp.status_code != 200:
                    print(f"❌ Failed to get user info: {resp.text}")
                    error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=userinfo_failed"
                    return RedirectResponse(url=error_url)
                
                user_info = resp.json()
                print(f"✅ User info: {json.dumps(user_info, indent=2)}")
        except Exception as e:
            print(f"❌ User info request failed: {str(e)}")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=userinfo_request"
            return RedirectResponse(url=error_url)
        
        # Extract user data
        email = user_info.get('email')
        name = user_info.get('name')
        picture = user_info.get('picture')
        google_id = user_info.get('sub')
        
        if not email:
            print("❌ No email in user info")
            error_url = f"{settings.FRONTEND_URL}/sign-up.html?error=no_email"
            return RedirectResponse(url=error_url)
        
        print(f"📧 Email: {email}")
        print(f"👤 Name: {name}")
        
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
        print(f"🔑 JWT created: {access_token[:20]}...")
        
        # Determine redirect
        if is_new:
            redirect_url = f"{settings.FRONTEND_URL}/frontend/sign-up.html?token={access_token}"
        else:
            redirect_url = f"{settings.FRONTEND_URL}/frontend/sign-in.html?token={access_token}"
        
        print(f"➡️ Final redirect URL: {redirect_url}")
        
        response = RedirectResponse(url=redirect_url)
        response.set_cookie(
            key="auth_token",
            value=access_token,
            httponly=True,
            max_age=3600,
            secure=settings.ENVIRONMENT == "production",
            samesite="lax"
        )
        
        print("="*60)
        print("✅ CALLBACK COMPLETED SUCCESSFULLY")
        print("="*60)
        
        return response
        
    except Exception as e:
        print(f"❌ UNHANDLED ERROR in callback: {str(e)}")
        import traceback
        traceback.print_exc()
        error_url = f"{settings.FRONTEND_URL}/frontend/sign-up.html?error=unexpected"
        return RedirectResponse(url=error_url)

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