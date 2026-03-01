from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from database import users_collection
from models import GoogleAuthRequest, TokenResponse
from auth import create_access_token, verify_google_token
from config import settings

app = FastAPI(title="ErrandEase API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5500", "http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Welcome to ErrandEase API"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

@app.post("/api/auth/google", response_model=TokenResponse)
async def google_auth(auth_data: GoogleAuthRequest):
    try:
        # Verify Google token
        google_user = await verify_google_token(auth_data.token)
        
        # Check if user exists
        existing_user = users_collection.find_one({"email": google_user["email"]})
        
        if existing_user:
            # Update existing user
            users_collection.update_one(
                {"email": google_user["email"]},
                {
                    "$set": {
                        "last_login": datetime.utcnow(),
                        "profile_picture": google_user["profile_picture"],
                        "full_name": google_user["full_name"]
                    }
                }
            )
            user_id = str(existing_user["_id"])
        else:
            # Create new user
            new_user = {
                "email": google_user["email"],
                "full_name": google_user["full_name"],
                "google_id": google_user["google_id"],
                "profile_picture": google_user["profile_picture"],
                "created_at": datetime.utcnow(),
                "last_login": datetime.utcnow(),
                "is_active": True
            }
            
            result = users_collection.insert_one(new_user)
            user_id = str(result.inserted_id)
        
        # Create access token
        access_token = create_access_token({
            "sub": user_id,
            "email": google_user["email"],
            "name": google_user["full_name"]
        })
        
        # Return token and user info
        return TokenResponse(
            access_token=access_token,
            user={
                "id": user_id,
                "email": google_user["email"],
                "name": google_user["full_name"],
                "picture": google_user["profile_picture"]
            }
        )
        
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)