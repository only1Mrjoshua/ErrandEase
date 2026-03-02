from pymongo import MongoClient
from pymongo.server_api import ServerApi
from config import settings
import certifi

# MongoDB Atlas connection with proper TLS/SSL settings
client = MongoClient(
    settings.MONGODB_URL,
    server_api=ServerApi('1'),
    tlsCAFile=certifi.where()  # This handles SSL certificates properly
)

# Test connection
try:
    # Send a ping to confirm a successful connection
    client.admin.command('ping')
    print("✅ Successfully connected to MongoDB Atlas!")
except Exception as e:
    print(f"❌ Failed to connect to MongoDB Atlas: {e}")

# Get database
db = client[settings.MONGODB_DB_NAME]

# Collections
users_collection = db["users"]

# Create indexes
users_collection.create_index("email", unique=True)
users_collection.create_index("google_id", unique=True, sparse=True)

print(f"📊 Using database: {settings.MONGODB_DB_NAME}")