import os
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv()
MONGO_URI = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("MONGO_DB_NAME")

if not MONGO_URI or not DB_NAME:
    raise RuntimeError("MONGO_URI and DB_NAME environment variables must be set.")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

print(f"Using MongoDB URI: {MONGO_URI}")
print(f"Using Database Name: {DB_NAME}")
collections = db.list_collection_names()
print(f"Collections to be cleared: {collections}")
for collection_name in collections:
    print(f"Clearing collection: {collection_name}")
    db.drop_collection(collection_name)
    print(f"Dropped collection: {collection_name}")
if not collections:
    print("No collections found to clear.")
print("Database cleared.")
