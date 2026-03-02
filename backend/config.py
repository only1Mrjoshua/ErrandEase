import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Settings:
    def __init__(self):
        # Environment (add this line)
        self.ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
        
        # MongoDB Atlas
        self.MONGODB_URL = os.getenv("MONGODB_URL", "")
        self.MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "errandease")
        
        # Google OAuth - Use environment-specific logic
        self.GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
        self.GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
        
        # Set redirect URI based on environment
        if self.ENVIRONMENT == "production":
            self.GOOGLE_REDIRECT_URI = os.getenv(
                "GOOGLE_REDIRECT_URI", 
                "https://errandeasebackend.onrender.com/api/auth/google/callback"
            )
            self.FRONTEND_URL = os.getenv("FRONTEND_URL", "https://errandease.onrender.com")
        else:
            self.GOOGLE_REDIRECT_URI = os.getenv(
                "GOOGLE_REDIRECT_URI", 
                "http://localhost:8000/api/auth/google/callback"
            )
            self.FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")
        
        # JWT
        self.JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
        self.JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
        self.JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
        
        # Validate critical settings
        self.validate()

    def validate(self):
        """Validate that critical settings are configured"""
        print(f"🌍 Environment: {self.ENVIRONMENT}")
        print(f"📡 Google Redirect URI: {self.GOOGLE_REDIRECT_URI}")
        print(f"🎨 Frontend URL: {self.FRONTEND_URL}")
        
        if not self.MONGODB_URL:
            print("⚠️  Warning: MONGODB_URL is not set in .env file")
        if not self.GOOGLE_CLIENT_ID:
            print("⚠️  Warning: GOOGLE_CLIENT_ID is not set in .env file")
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY == "your-secret-key-change-this-in-production":
            print("⚠️  Warning: JWT_SECRET_KEY is using default value - change this in production!")

# Create a global settings instance
settings = Settings()