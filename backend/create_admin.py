#!/usr/bin/env python
"""
Admin creation script for ErrandEase - Standalone version
Run this script to create the first admin user.
Usage: python create_admin.py
"""

import os
import sys
import logging
from datetime import datetime
from dotenv import load_dotenv
import bcrypt
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# MongoDB connection settings - get from environment or use defaults
MONGODB_URL = os.getenv("MONGODB_URL")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "errandease")

def hash_password(password: str) -> str:
    """
    Hash password using bcrypt directly
    Truncates to 72 bytes if necessary (bcrypt limit)
    """
    if not password:
        raise ValueError("Password cannot be empty")
    
    # Truncate to 72 bytes if longer
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    
    # Return as string
    return hashed.decode('utf-8')

def create_admin():
    """Create admin user from environment variables"""
    
    # Get admin credentials from environment
    admin_name = os.getenv("ADMIN_NAME")
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_username = os.getenv("ADMIN_USERNAME")
    admin_password = os.getenv("ADMIN_PASSWORD")
    
    # Validate required fields
    missing = []
    if not admin_name:
        missing.append("ADMIN_NAME")
    if not admin_email:
        missing.append("ADMIN_EMAIL")
    if not admin_username:
        missing.append("ADMIN_USERNAME")
    if not admin_password:
        missing.append("ADMIN_PASSWORD")
    
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        logger.error("Please set these variables in your .env file")
        sys.exit(1)
    
    if not MONGODB_URL:
        logger.error("MONGODB_URL not set in environment")
        sys.exit(1)
    
    # Connect to MongoDB
    try:
        client = MongoClient(MONGODB_URL)
        db = client[MONGODB_DB_NAME]
        users_collection = db["users"]
        
        logger.info(f"Connected to MongoDB: {MONGODB_DB_NAME}")
        
        # Check if admin already exists
        existing = users_collection.find_one({
            "$or": [
                {"email": admin_email},
                {"username": admin_username}
            ]
        })
        
        if existing:
            logger.warning(f"User with email '{admin_email}' or username '{admin_username}' already exists")
            
            # Check if existing user is admin
            if existing.get("role") == "admin":
                logger.info("Admin user already exists. No action needed.")
                return
            else:
                # Upgrade to admin? Ask user
                logger.warning("User exists but is not an admin.")
                response = input("Do you want to upgrade this user to admin? (y/n): ").strip().lower()
                if response == 'y':
                    # Hash password
                    password_hash = hash_password(admin_password)
                    
                    # Update user
                    users_collection.update_one(
                        {"_id": existing["_id"]},
                        {
                            "$set": {
                                "role": "admin",
                                "password_hash": password_hash,
                                "updated_at": datetime.utcnow()
                            },
                            "$push": {
                                "auth_identities": {
                                    "provider": "email",
                                    "provider_sub": admin_email,
                                    "created_at": datetime.utcnow()
                                }
                            }
                        }
                    )
                    logger.info(f"User {admin_email} upgraded to admin successfully!")
                else:
                    logger.info("Operation cancelled.")
                return
        
        # Create new admin user
        logger.info(f"Creating new admin user with email: {admin_email}")
        
        # Hash password
        password_hash = hash_password(admin_password)
        
        # Create user document directly
        now = datetime.utcnow()
        user_dict = {
            "email": admin_email,
            "name": admin_name,
            "username": admin_username,
            "password_hash": password_hash,
            "auth_identities": [
                {
                    "provider": "email",
                    "provider_sub": admin_email,
                    "created_at": now
                }
            ],
            "role": "admin",
            "is_active": True,
            "created_at": now,
            "last_login": None
        }
        
        # Insert into database
        result = users_collection.insert_one(user_dict)
        
        logger.info(f"✅ Admin user created successfully with ID: {result.inserted_id}")
        logger.info(f"Email: {admin_email}")
        logger.info(f"Username: {admin_username}")
        logger.info("You can now log in to the admin dashboard.")
        
    except DuplicateKeyError as e:
        logger.error(f"Duplicate key error: {e}")
        logger.error("An admin with this email or username may already exist.")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error creating admin: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if 'client' in locals():
            client.close()

if __name__ == "__main__":
    create_admin()