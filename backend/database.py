from pymongo import MongoClient
from config import settings

# MongoDB connection
client = MongoClient(settings.MONGODB_URL)
db = client[settings.MONGODB_DB_NAME]

# Collections
users_collection = db["users"]

# Create indexes
users_collection.create_index("email", unique=True)
users_collection.create_index("google_id", unique=True, sparse=True)