from pymongo import MongoClient
from pymongo.server_api import ServerApi
from config import settings
import certifi
import logging

logger = logging.getLogger(__name__)

# MongoDB Atlas connection with proper TLS/SSL settings
client = MongoClient(
    settings.MONGODB_URL,
    server_api=ServerApi('1'),
    tlsCAFile=certifi.where(),  # This handles SSL certificates properly
    connectTimeoutMS=30000,  # Increase timeout to 30 seconds
    socketTimeoutMS=45000,
)

# Test connection
try:
    # Send a ping to confirm a successful connection
    client.admin.command('ping')
    logger.info("✅ Successfully connected to MongoDB Atlas!")
except Exception as e:
    logger.error(f"❌ Failed to connect to MongoDB Atlas: {e}")
    # Don't raise here, let the app continue but with limited functionality

# Get database
db = client[settings.MONGODB_DB_NAME]

# Collections
users_collection = db["users"]
refresh_tokens_collection = db["refresh_tokens"]  # Add this for refresh tokens

# Create indexes
try:
    users_collection.create_index("email", unique=True)
    users_collection.create_index("google_id", unique=True, sparse=True)
    users_collection.create_index("username", unique=True, sparse=True)
    
    # Refresh tokens indexes
    refresh_tokens_collection.create_index("user_id")
    refresh_tokens_collection.create_index("token", unique=True)
    refresh_tokens_collection.create_index("expires_at", expireAfterSeconds=0)
    
    logger.info("📊 Database indexes created successfully")
except Exception as e:
    logger.warning(f"Could not create indexes: {e}")

logger.info(f"📊 Using database: {settings.MONGODB_DB_NAME}")