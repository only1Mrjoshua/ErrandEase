import os
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class Settings:
    def __init__(self):
        # Environment
        self.ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
        
        # MongoDB Atlas
        self.MONGODB_URL = os.getenv("MONGODB_URL", "")
        self.MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "errandease")
        
        # Google OAuth
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
        
        # JWT Settings
        self.JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
        self.SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "")
        self.JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
        self.JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
        self.JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))
        
        # Security settings
        self.RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "10"))
        self.RATE_LIMIT_PERIOD = int(os.getenv("RATE_LIMIT_PERIOD", "60"))  # seconds
        
        # Cloudinary Settings - NEW
        self.CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
        self.CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
        self.CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")
        self.CLOUDINARY_UPLOAD_FOLDER = os.getenv("CLOUDINARY_UPLOAD_FOLDER", "errandease/verifications")
        
        # Validate critical settings
        self.validate()

    def validate(self):
        """Validate that critical settings are configured"""
        logger.info(f"Environment: {self.ENVIRONMENT}")
        logger.info(f"Frontend URL: {self.FRONTEND_URL}")
        
        if self.ENVIRONMENT == "production":
            if not self.MONGODB_URL:
                raise RuntimeError("MONGODB_URL must be set in production")
            if not self.GOOGLE_CLIENT_ID:
                raise RuntimeError("GOOGLE_CLIENT_ID must be set in production")
            if not self.GOOGLE_CLIENT_SECRET:
                raise RuntimeError("GOOGLE_CLIENT_SECRET must be set in production")
            if not self.JWT_SECRET_KEY:
                raise RuntimeError("JWT_SECRET_KEY must be set in production")
            if not self.SESSION_SECRET_KEY:
                raise RuntimeError("SESSION_SECRET_KEY must be set in production")
            if not self.CLOUDINARY_CLOUD_NAME:  # NEW
                raise RuntimeError("CLOUDINARY_CLOUD_NAME must be set in production")
            if not self.CLOUDINARY_API_KEY:
                raise RuntimeError("CLOUDINARY_API_KEY must be set in production")
            if not self.CLOUDINARY_API_SECRET:
                raise RuntimeError("CLOUDINARY_API_SECRET must be set in production")
            
            # Ensure secrets are not defaults
            if self.JWT_SECRET_KEY == "your-secret-key-change-this-in-production":
                raise RuntimeError("JWT_SECRET_KEY must be changed from default in production")
            if self.SESSION_SECRET_KEY == "your-session-secret-change-this-in-production":
                raise RuntimeError("SESSION_SECRET_KEY must be changed from default in production")

# Create a global settings instance
settings = Settings()