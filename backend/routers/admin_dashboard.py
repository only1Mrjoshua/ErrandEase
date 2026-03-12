from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional, Dict, Any
from datetime import datetime
from bson import ObjectId
import logging
import hashlib
import unicodedata
import bcrypt
from fastapi.responses import StreamingResponse
from database import (
    users_collection,
    errands_collection,
    agent_profiles_collection,
    refresh_tokens_collection
)
from core.roles import require_admin
from auth import create_access_token, create_refresh_token
from schemas.admin import (
    AdminLoginRequest, AdminLoginResponse,
    DashboardStatsResponse,
    CustomerCreateRequest, CustomerUpdateRequest, CustomerResponse,
    AgentCreateRequest, AgentUpdateRequest, AdminAgentResponse,
    AdminErrandResponse, AdminErrandListResponse,
    AssignErrandRequest,
    PaginatedCustomersResponse, PaginatedAgentsResponse, PaginatedErrandsResponse
)
from models import User, AuthIdentity

router = APIRouter(prefix="/api/admin", tags=["admin dashboard"])
logger = logging.getLogger(__name__)

PASSWORD_SCHEME_SHA256_BCRYPT = "sha256+bcrypt$"


# ==================== HELPER FUNCTIONS ====================

def validate_object_id(id_str: str) -> bool:
    """Validate MongoDB ObjectId format."""
    try:
        ObjectId(id_str)
        return True
    except Exception:
        return False


def normalize_password(password: str) -> str:
    """
    Normalize password before hashing/verifying.
    Helps reduce Unicode ambiguity and keeps password handling consistent.
    """
    return unicodedata.normalize("NFKC", password)


def sha256_hex(password: str) -> str:
    """
    SHA-256 hash of normalized password.
    Returns a 64-character hex string, safely below bcrypt's 72-byte limit.
    """
    normalized = normalize_password(password)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """
    Production-safe password hashing:
    1. Normalize password
    2. SHA-256 hash it
    3. bcrypt the hex digest using bcrypt package directly
    """
    prehashed = sha256_hex(password).encode("utf-8")
    hashed = bcrypt.hashpw(prehashed, bcrypt.gensalt(rounds=12)).decode("utf-8")
    return f"{PASSWORD_SCHEME_SHA256_BCRYPT}{hashed}"


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    """
    Verify password against either:
    - new sha256+bcrypt format
    - legacy raw bcrypt format stored in old records

    This allows safe migration without breaking existing users.
    """
    if not stored_hash:
        return False

    try:
        # New format
        if stored_hash.startswith(PASSWORD_SCHEME_SHA256_BCRYPT):
            bcrypt_hash = stored_hash[len(PASSWORD_SCHEME_SHA256_BCRYPT):].encode("utf-8")
            prehashed = sha256_hex(password).encode("utf-8")
            return bcrypt.checkpw(prehashed, bcrypt_hash)

        # Legacy raw bcrypt fallback
        return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))

    except Exception as e:
        logger.warning(f"Password verification failed: {e}")
        return False


def serialize_user(user_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert user document to API response."""
    if user_doc:
        user_doc["id"] = str(user_doc.pop("_id"))
    return user_doc


def serialize_errand(errand_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert errand document to API response."""
    if errand_doc:
        errand_doc["id"] = str(errand_doc.pop("_id"))
    return errand_doc


async def get_customer_details(customer_id: str) -> Dict[str, Any]:
    """Get customer details by ID."""
    try:
        user = users_collection.find_one({"_id": ObjectId(customer_id)})
        if user:
            return {
                "id": str(user["_id"]),
                "name": user.get("name", "Unknown"),
                "email": user.get("email", "")
            }
    except Exception:
        pass
    return {"id": customer_id, "name": "Unknown", "email": ""}


async def get_agent_details(agent_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Get agent details by ID."""
    if not agent_id:
        return None
    try:
        user = users_collection.find_one({"_id": ObjectId(agent_id)})
        if user:
            return {
                "id": str(user["_id"]),
                "name": user.get("name", "Unknown"),
                "email": user.get("email", "")
            }
    except Exception:
        pass
    return None


# ==================== ADMIN AUTH ====================

@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(login_data: AdminLoginRequest):
    """
    Admin login endpoint (email/username + password)
    No signup - admin accounts created via seed script only
    """
    if users_collection is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )

    user = users_collection.find_one({
        "$or": [
            {"email": login_data.username},
            {"username": login_data.username}
        ]
    })

    if not user:
        logger.warning(f"Admin login failed: user not found - {login_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    if user.get("role") != "admin":
        logger.warning(f"Non-admin attempted admin login: {user.get('email')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin privileges required."
        )

    if not user.get("is_active", True):
        logger.warning(f"Inactive admin attempted login: {user.get('email')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support."
        )

    stored_hash = user.get("password_hash")
    if not verify_password(login_data.password, stored_hash):
        logger.warning(f"Admin login failed: invalid password for {user.get('email')}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    now = datetime.utcnow()
    users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": now}}
    )

    access_token = create_access_token({
        "sub": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "role": "admin"
    })

    refresh_token = create_refresh_token(str(user["_id"]))

    user_response = {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "username": user.get("username", ""),
        "role": "admin",
        "picture": user.get("picture")
    }

    return AdminLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=15 * 60,
        user=user_response
    )


# ==================== DASHBOARD STATS ====================

@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(current_user: dict = Depends(require_admin)):
    total_customers = users_collection.count_documents({"role": "customer"})
    total_agents = users_collection.count_documents({"role": "agent"})
    total_active_users = users_collection.count_documents({"is_active": True})

    total_errands = errands_collection.count_documents({})
    pending_errands = errands_collection.count_documents({"status": "pending"})
    accepted_errands = errands_collection.count_documents({"status": "accepted"})
    in_progress_errands = errands_collection.count_documents({"status": "in_progress"})
    awaiting_confirmation_errands = errands_collection.count_documents({"status": "awaiting_confirmation"})
    completed_errands = errands_collection.count_documents({"status": "completed"})
    cancelled_errands = errands_collection.count_documents({"status": "cancelled"})

    blocked_agents = agent_profiles_collection.count_documents({"account_status": "blocked"})
    pending_verification_agents = agent_profiles_collection.count_documents({"verification_status": "pending"})

    return DashboardStatsResponse(
        total_customers=total_customers,
        total_agents=total_agents,
        total_errands=total_errands,
        pending_errands=pending_errands,
        accepted_errands=accepted_errands,
        in_progress_errands=in_progress_errands,
        awaiting_confirmation_errands=awaiting_confirmation_errands,
        completed_errands=completed_errands,
        cancelled_errands=cancelled_errands,
        blocked_agents=blocked_agents,
        pending_verification_agents=pending_verification_agents,
        total_active_users=total_active_users
    )


# ==================== CUSTOMER MANAGEMENT ====================

@router.get("/customers", response_model=PaginatedCustomersResponse)
async def get_customers(
    current_user: dict = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by name or email")
):
    skip = (page - 1) * limit

    query = {"role": "customer"}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"username": {"$regex": search, "$options": "i"}}
        ]

    total = users_collection.count_documents(query)
    cursor = users_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)

    customers = []
    for doc in cursor:
        errand_count = errands_collection.count_documents({"user_id": str(doc["_id"])})
        completed_errands = errands_collection.find({
            "user_id": str(doc["_id"]),
            "status": "completed"
        })
        total_spent = sum(e.get("total_cost", 0) for e in completed_errands)

        customer = serialize_user(doc)
        customer["errand_count"] = errand_count
        customer["total_spent"] = total_spent
        customers.append(CustomerResponse(**customer))

    return PaginatedCustomersResponse(
        total=total,
        page=page,
        limit=limit,
        customers=customers
    )


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: str,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(customer_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid customer ID format"
        )

    user = users_collection.find_one({
        "_id": ObjectId(customer_id),
        "role": "customer"
    })

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )

    errand_count = errands_collection.count_documents({"user_id": customer_id})
    completed_errands = errands_collection.find({
        "user_id": customer_id,
        "status": "completed"
    })
    total_spent = sum(e.get("total_cost", 0) for e in completed_errands)

    customer = serialize_user(user)
    customer["errand_count"] = errand_count
    customer["total_spent"] = total_spent

    return CustomerResponse(**customer)


@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    customer_data: CustomerCreateRequest,
    current_user: dict = Depends(require_admin)
):
    existing = users_collection.find_one({
        "$or": [
            {"email": customer_data.email},
            {"username": customer_data.username}
        ]
    })

    if existing:
        if existing.get("email") == customer_data.email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists"
            )
        if existing.get("username") == customer_data.username:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists"
            )

    password_hash = hash_password(customer_data.password)

    now = datetime.utcnow()
    new_user = User(
        email=customer_data.email,
        name=customer_data.name,
        username=customer_data.username,
        password_hash=password_hash,
        auth_identities=[AuthIdentity(provider="email", provider_sub=customer_data.email)],
        role="customer",
        is_active=True,
        created_at=now
    )

    user_dict = new_user.model_dump(by_alias=True, exclude={"id"})
    user_dict = {k: v for k, v in user_dict.items() if v is not None}

    try:
        result = users_collection.insert_one(user_dict)
        created_user = users_collection.find_one({"_id": result.inserted_id})

        logger.info(f"Admin {current_user['id']} created new customer: {customer_data.email}")

        customer = serialize_user(created_user)
        customer["errand_count"] = 0
        customer["total_spent"] = 0

        return CustomerResponse(**customer)

    except Exception as e:
        logger.error(f"Failed to create customer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create customer"
        )


@router.put("/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: str,
    update_data: CustomerUpdateRequest,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(customer_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid customer ID format"
        )

    customer = users_collection.find_one({
        "_id": ObjectId(customer_id),
        "role": "customer"
    })

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )

    update_dict = {}

    if update_data.name is not None:
        update_dict["name"] = update_data.name

    if update_data.username is not None:
        existing = users_collection.find_one({
            "username": update_data.username,
            "_id": {"$ne": ObjectId(customer_id)}
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists"
            )
        update_dict["username"] = update_data.username

    if update_data.phone_number is not None:
        update_dict["phone_number"] = update_data.phone_number

    if update_data.is_active is not None:
        update_dict["is_active"] = update_data.is_active

    if update_data.password:
        update_dict["password_hash"] = hash_password(update_data.password)

    if update_dict:
        update_dict["updated_at"] = datetime.utcnow()
        users_collection.update_one(
            {"_id": ObjectId(customer_id)},
            {"$set": update_dict}
        )

    updated = users_collection.find_one({"_id": ObjectId(customer_id)})
    updated = serialize_user(updated)

    errand_count = errands_collection.count_documents({"user_id": customer_id})

    pipeline = [
        {"$match": {"user_id": customer_id, "status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_cost"}}}
    ]
    result = list(errands_collection.aggregate(pipeline))
    total_spent = result[0]["total"] if result else 0

    updated["errand_count"] = errand_count
    updated["total_spent"] = total_spent

    logger.info(f"Admin {current_user['id']} updated customer: {customer_id}")

    return CustomerResponse(**updated)


@router.delete("/customers/{customer_id}")
async def delete_customer(
    customer_id: str,
    current_user: dict = Depends(require_admin)
):
    # Log the received ID for debugging
    logger.info(f"Attempting to delete customer with ID: {customer_id}")
    
    # More flexible ObjectId validation
    try:
        # Try to convert to ObjectId directly - this will handle both with and without braces
        obj_id = ObjectId(customer_id.strip('{}'))
    except Exception as e:
        logger.error(f"Invalid ObjectId format: {customer_id}, error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid customer ID format: {customer_id}. Expected a valid MongoDB ObjectId."
        )

    # Search using the converted ObjectId
    customer = users_collection.find_one({
        "_id": obj_id,
        "role": "customer"
    })

    if not customer:
        logger.warning(f"Customer not found with ID: {customer_id} (ObjectId: {obj_id})")
        
        # Try to find by string ID as fallback (in case IDs are stored as strings)
        customer = users_collection.find_one({
            "_id": customer_id,
            "role": "customer"
        })
        
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer with ID {customer_id} not found"
            )
        else:
            obj_id = customer_id  # Use string ID for deletion

    # Check for active errands
    pending_errands = errands_collection.count_documents({
        "user_id": str(obj_id),  # Convert to string for comparison
        "status": {"$in": ["pending", "accepted", "in_progress", "awaiting_confirmation"]}
    })

    if pending_errands > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete customer with {pending_errands} active errands. Cancel or complete them first."
        )

    # Delete related data
    refresh_tokens_collection.delete_many({"user_id": str(obj_id)})
    errands_collection.delete_many({"user_id": str(obj_id)})

    # Delete the user
    result = users_collection.delete_one({"_id": obj_id})

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete customer"
        )

    logger.info(f"Admin {current_user['id']} deleted customer: {customer_id}")

    return {"message": "Customer deleted successfully", "success": True}


@router.get("/customers/{customer_id}/errands")
async def get_customer_errands(
    customer_id: str,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(customer_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid customer ID format"
        )

    customer = users_collection.find_one({
        "_id": ObjectId(customer_id),
        "role": "customer"
    })

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )

    cursor = errands_collection.find({"user_id": customer_id}).sort("created_at", -1)

    errands = []
    for doc in cursor:
        errand = serialize_errand(doc)

        if errand.get("assigned_agent_id"):
            agent = await get_agent_details(errand["assigned_agent_id"])
            if agent:
                errand["assigned_agent_name"] = agent["name"]

        errands.append(errand)

    return errands


# ==================== AGENT MANAGEMENT ====================

@router.get("/agents", response_model=PaginatedAgentsResponse)
async def get_agents(
    current_user: dict = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by name, email, or business name"),
    verification_status: Optional[str] = Query(None, description="Filter by verification status"),
    account_status: Optional[str] = Query(None, description="Filter by account status")
):
    skip = (page - 1) * limit

    user_query = {"role": "agent"}
    if search:
        user_query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"username": {"$regex": search, "$options": "i"}}
        ]

    users = list(users_collection.find(user_query))
    user_ids = [str(u["_id"]) for u in users]

    if not user_ids:
        return PaginatedAgentsResponse(total=0, page=page, limit=limit, agents=[])

    profile_query = {"user_id": {"$in": user_ids}}
    if verification_status:
        profile_query["verification_status"] = verification_status
    if account_status:
        profile_query["account_status"] = account_status

    total = agent_profiles_collection.count_documents(profile_query)
    cursor = agent_profiles_collection.find(profile_query).sort("created_at", -1).skip(skip).limit(limit)

    agents = []
    for profile in cursor:
        profile["id"] = str(profile.pop("_id"))

        user = next((u for u in users if str(u["_id"]) == profile["user_id"]), None)
        if not user:
            continue

        assigned_count = errands_collection.count_documents({
            "assigned_agent_id": profile["user_id"],
            "status": {"$in": ["accepted", "in_progress", "awaiting_confirmation"]}
        })

        agent_data = {
            "id": profile["id"],
            "user_id": profile["user_id"],
            "email": user.get("email", ""),
            "name": user.get("name", ""),
            "username": user.get("username", ""),
            "phone_number": profile.get("phone_number"),
            "business_name": profile.get("business_name"),
            "role": "agent",
            "is_active": user.get("is_active", True),
            "account_status": profile.get("account_status", "active"),
            "verification_status": profile.get("verification_status", "not_submitted"),
            "id_verified": profile.get("id_verified", False),
            "blocked_reason": profile.get("blocked_reason"),
            "total_earnings": profile.get("total_earnings", 0),
            "pending_earnings": profile.get("pending_earnings", 0),
            "completed_errands_count": profile.get("completed_errands_count", 0),
            "rating": profile.get("rating", 0.0),
            "created_at": profile.get("created_at"),
            "last_login": user.get("last_login"),
            "assigned_errands_count": assigned_count
        }

        agents.append(AdminAgentResponse(**agent_data))

    return PaginatedAgentsResponse(
        total=total,
        page=page,
        limit=limit,
        agents=agents
    )


@router.get("/agents/{agent_id}", response_model=AdminAgentResponse)
async def get_agent(
    agent_id: str,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(agent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )

    user = users_collection.find_one({
        "_id": ObjectId(agent_id),
        "role": "agent"
    })

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )

    profile = agent_profiles_collection.find_one({"user_id": agent_id})

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent profile not found"
        )

    profile["id"] = str(profile.pop("_id"))

    assigned_count = errands_collection.count_documents({
        "assigned_agent_id": agent_id,
        "status": {"$in": ["accepted", "in_progress", "awaiting_confirmation"]}
    })

    agent_data = {
        "id": profile["id"],
        "user_id": profile["user_id"],
        "email": user.get("email", ""),
        "name": user.get("name", ""),
        "username": user.get("username", ""),
        "phone_number": profile.get("phone_number"),
        "business_name": profile.get("business_name"),
        "role": "agent",
        "is_active": user.get("is_active", True),
        "account_status": profile.get("account_status", "active"),
        "verification_status": profile.get("verification_status", "not_submitted"),
        "id_verified": profile.get("id_verified", False),
        "blocked_reason": profile.get("blocked_reason"),
        "total_earnings": profile.get("total_earnings", 0),
        "pending_earnings": profile.get("pending_earnings", 0),
        "completed_errands_count": profile.get("completed_errands_count", 0),
        "rating": profile.get("rating", 0.0),
        "created_at": profile.get("created_at"),
        "last_login": user.get("last_login"),
        "assigned_errands_count": assigned_count
    }

    return AdminAgentResponse(**agent_data)


@router.post("/agents", response_model=AdminAgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_data: AgentCreateRequest,
    current_user: dict = Depends(require_admin)
):
    existing = users_collection.find_one({
        "$or": [
            {"email": agent_data.email},
            {"username": agent_data.username}
        ]
    })

    if existing:
        if existing.get("email") == agent_data.email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists"
            )
        if existing.get("username") == agent_data.username:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists"
            )

    password_hash = hash_password(agent_data.password)

    now = datetime.utcnow()
    new_user = User(
        email=agent_data.email,
        name=agent_data.name,
        username=agent_data.username,
        password_hash=password_hash,
        auth_identities=[AuthIdentity(provider="email", provider_sub=agent_data.email)],
        role="agent",
        is_active=True,
        created_at=now
    )

    user_dict = new_user.model_dump(by_alias=True, exclude={"id"})
    user_dict = {k: v for k, v in user_dict.items() if v is not None}

    try:
        user_result = users_collection.insert_one(user_dict)
        user_id = str(user_result.inserted_id)

        from models.agent import AgentProfile
        new_profile = AgentProfile(
            user_id=user_id,
            business_name=agent_data.business_name,
            phone_number=agent_data.phone_number,
            verification_status="not_submitted"
        )
        profile_dict = new_profile.model_dump(by_alias=True, exclude={"id"})
        profile_result = agent_profiles_collection.insert_one(profile_dict)

        logger.info(f"Admin {current_user['id']} created new agent: {agent_data.email}")

        profile = agent_profiles_collection.find_one({"_id": profile_result.inserted_id})
        profile["id"] = str(profile.pop("_id"))

        agent_response = {
            "id": profile["id"],
            "user_id": user_id,
            "email": agent_data.email,
            "name": agent_data.name,
            "username": agent_data.username,
            "phone_number": profile.get("phone_number"),
            "business_name": profile.get("business_name"),
            "role": "agent",
            "is_active": True,
            "account_status": "active",
            "verification_status": "not_submitted",
            "id_verified": False,
            "blocked_reason": None,
            "total_earnings": 0,
            "pending_earnings": 0,
            "completed_errands_count": 0,
            "rating": 0.0,
            "created_at": profile.get("created_at"),
            "last_login": None,
            "assigned_errands_count": 0
        }

        return AdminAgentResponse(**agent_response)

    except Exception as e:
        logger.error(f"Failed to create agent: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create agent"
        )


@router.put("/agents/{agent_id}", response_model=AdminAgentResponse)
async def update_agent(
    agent_id: str,
    update_data: AgentUpdateRequest,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(agent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )

    user = users_collection.find_one({
        "_id": ObjectId(agent_id),
        "role": "agent"
    })

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )

    profile = agent_profiles_collection.find_one({"user_id": agent_id})
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent profile not found"
        )

    if update_data.username and update_data.username != user.get("username"):
        username_exists = users_collection.find_one({
            "username": update_data.username,
            "_id": {"$ne": ObjectId(agent_id)}
        })
        if username_exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists"
            )

    user_update = {}
    if update_data.name is not None:
        user_update["name"] = update_data.name
    if update_data.username is not None:
        user_update["username"] = update_data.username
    if update_data.is_active is not None:
        user_update["is_active"] = update_data.is_active
    if update_data.password is not None:
        user_update["password_hash"] = hash_password(update_data.password)

    profile_update = {}
    if update_data.phone_number is not None:
        profile_update["phone_number"] = update_data.phone_number
    if update_data.business_name is not None:
        profile_update["business_name"] = update_data.business_name
    if update_data.account_status is not None:
        profile_update["account_status"] = update_data.account_status
        if update_data.account_status == "active":
            profile_update["blocked_reason"] = None
            profile_update["blocked_at"] = None
            profile_update["blocked_by"] = None
    if update_data.verification_status is not None:
        profile_update["verification_status"] = update_data.verification_status
        if update_data.verification_status == "approved":
            profile_update["id_verified"] = True
        elif update_data.verification_status == "rejected":
            profile_update["id_verified"] = False

    now = datetime.utcnow()
    if profile_update:
        profile_update["updated_at"] = now

    if user_update:
        user_update["updated_at"] = now
        users_collection.update_one(
            {"_id": ObjectId(agent_id)},
            {"$set": user_update}
        )

    if profile_update:
        agent_profiles_collection.update_one(
            {"user_id": agent_id},
            {"$set": profile_update}
        )

    logger.info(f"Admin {current_user['id']} updated agent: {agent_id}")

    return await get_agent(agent_id, current_user)


@router.delete("/agents/{agent_id}")
async def delete_agent(
    agent_id: str,
    current_user: dict = Depends(require_admin)
):
    logger.info(f"Attempting to delete agent with ID: {agent_id}")
    
    # First, find the agent profile to get the user_id
    profile = None
    
    # Try to find the profile by _id (if agent_id is the profile ID)
    if validate_object_id(agent_id):
        profile = agent_profiles_collection.find_one({"_id": ObjectId(agent_id)})
    
    # If not found, try as user_id (in case agent_id is the user_id)
    if not profile:
        profile = agent_profiles_collection.find_one({"user_id": agent_id})
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent profile with ID {agent_id} not found"
        )
    
    # Get the actual user_id from the profile
    user_id = profile["user_id"]
    
    # Find the user
    try:
        user = users_collection.find_one({
            "_id": ObjectId(user_id),
            "role": "agent"
        })
    except:
        # If user_id is not a valid ObjectId, try as string
        user = users_collection.find_one({
            "_id": user_id,
            "role": "agent"
        })
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent user with ID {user_id} not found"
        )
    
    # Check for active errands
    assigned_errands = errands_collection.count_documents({
        "assigned_agent_id": user_id,
        "status": {"$in": ["accepted", "in_progress", "awaiting_confirmation"]}
    })

    if assigned_errands > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete agent with {assigned_errands} active errands. Reassign or complete them first."
        )

    # Delete related data
    refresh_tokens_collection.delete_many({"user_id": user_id})
    agent_profiles_collection.delete_one({"user_id": user_id})

    # Delete the user
    result = users_collection.delete_one({"_id": user["_id"]})

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete agent"
        )

    logger.info(f"Admin {current_user['id']} deleted agent: {user_id}")

    return {"message": "Agent deleted successfully", "success": True}


@router.get("/agents/{agent_id}/errands")
async def get_agent_errands(
    agent_id: str,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(agent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )

    agent = users_collection.find_one({
        "_id": ObjectId(agent_id),
        "role": "agent"
    })

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )

    cursor = errands_collection.find({
        "assigned_agent_id": agent_id
    }).sort("created_at", -1)

    errands = []
    for doc in cursor:
        errand = serialize_errand(doc)

        customer = await get_customer_details(errand["user_id"])
        errand["customer_name"] = customer["name"]
        errand["customer_email"] = customer["email"]

        errands.append(errand)

    return errands


# ==================== ERRAND MANAGEMENT ====================

@router.get("/errands", response_model=PaginatedErrandsResponse)
async def get_all_errands(
    current_user: dict = Depends(require_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, description="Filter by status"),
    customer_id: Optional[str] = Query(None, description="Filter by customer ID"),
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    search: Optional[str] = Query(None, description="Search in title and description")
):
    skip = (page - 1) * limit

    query = {}
    if status:
        query["status"] = status
    if customer_id:
        if not validate_object_id(customer_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid customer ID format"
            )
        query["user_id"] = customer_id
    if agent_id:
        if not validate_object_id(agent_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid agent ID format"
            )
        query["assigned_agent_id"] = agent_id
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]

    total = errands_collection.count_documents(query)
    cursor = errands_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)

    errands = []
    for doc in cursor:
        errand = serialize_errand(doc)

        customer = await get_customer_details(errand["user_id"])
        errand["customer_name"] = customer["name"]

        if errand.get("assigned_agent_id"):
            agent = await get_agent_details(errand["assigned_agent_id"])
            if agent:
                errand["assigned_agent_name"] = agent["name"]

        errands.append(AdminErrandListResponse(**errand))

    return PaginatedErrandsResponse(
        total=total,
        page=page,
        limit=limit,
        errands=errands
    )


@router.get("/errands/{errand_id}", response_model=AdminErrandResponse)
async def get_errand(
    errand_id: str,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(errand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid errand ID format"
        )

    errand = errands_collection.find_one({"_id": ObjectId(errand_id)})

    if not errand:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found"
        )

    errand_dict = serialize_errand(errand)

    customer = await get_customer_details(errand_dict["user_id"])
    errand_dict["customer_id"] = customer["id"]
    errand_dict["customer_name"] = customer["name"]
    errand_dict["customer_email"] = customer["email"]

    if errand_dict.get("assigned_agent_id"):
        agent = await get_agent_details(errand_dict["assigned_agent_id"])
        if agent:
            errand_dict["assigned_agent_name"] = agent["name"]
            errand_dict["assigned_agent_email"] = agent["email"]

    return AdminErrandResponse(**errand_dict)


@router.put("/errands/{errand_id}/assign")
async def assign_errand(
    errand_id: str,
    assign_data: AssignErrandRequest,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(errand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid errand ID format"
        )

    errand = errands_collection.find_one({"_id": ObjectId(errand_id)})
    if not errand:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found"
        )

    if not validate_object_id(assign_data.agent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )

    agent = users_collection.find_one({
        "_id": ObjectId(assign_data.agent_id),
        "role": "agent"
    })

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )

    agent_profile = agent_profiles_collection.find_one({"user_id": assign_data.agent_id})
    if not agent_profile or agent_profile.get("verification_status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent is not verified and cannot be assigned errands"
        )

    if agent_profile.get("account_status") == "blocked":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign errand to blocked agent"
        )

    if errand["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot assign errand with status: {errand['status']}"
        )

    now = datetime.utcnow()
    result = errands_collection.update_one(
        {"_id": ObjectId(errand_id)},
        {
            "$set": {
                "assigned_agent_id": assign_data.agent_id,
                "assigned_agent_name": agent.get("name"),
                "status": "accepted",
                "accepted_at": now,
                "updated_at": now
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to assign errand"
        )

    logger.info(f"Admin {current_user['id']} assigned errand {errand_id} to agent {assign_data.agent_id}")

    return {"message": "Errand assigned successfully"}


@router.put("/errands/{errand_id}/reassign")
async def reassign_errand(
    errand_id: str,
    assign_data: AssignErrandRequest,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(errand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid errand ID format"
        )

    errand = errands_collection.find_one({"_id": ObjectId(errand_id)})
    if not errand:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found"
        )

    if not validate_object_id(assign_data.agent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )

    agent = users_collection.find_one({
        "_id": ObjectId(assign_data.agent_id),
        "role": "agent"
    })

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )

    agent_profile = agent_profiles_collection.find_one({"user_id": assign_data.agent_id})
    if not agent_profile or agent_profile.get("verification_status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent is not verified and cannot be assigned errands"
        )

    if agent_profile.get("account_status") == "blocked":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign errand to blocked agent"
        )

    if errand["status"] not in ["accepted", "in_progress"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reassign errand with status: {errand['status']}"
        )

    now = datetime.utcnow()
    result = errands_collection.update_one(
        {"_id": ObjectId(errand_id)},
        {
            "$set": {
                "assigned_agent_id": assign_data.agent_id,
                "assigned_agent_name": agent.get("name"),
                "updated_at": now
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reassign errand"
        )

    logger.info(f"Admin {current_user['id']} reassigned errand {errand_id} to agent {assign_data.agent_id}")

    return {"message": "Errand reassigned successfully"}


@router.put("/errands/{errand_id}/unassign")
async def unassign_errand(
    errand_id: str,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(errand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid errand ID format"
        )

    errand = errands_collection.find_one({"_id": ObjectId(errand_id)})
    if not errand:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found"
        )

    if errand["status"] not in ["accepted", "in_progress"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot unassign errand with status: {errand['status']}"
        )

    now = datetime.utcnow()
    result = errands_collection.update_one(
        {"_id": ObjectId(errand_id)},
        {
            "$set": {
                "assigned_agent_id": None,
                "assigned_agent_name": None,
                "status": "pending",
                "accepted_at": None,
                "updated_at": now
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unassign errand"
        )

    logger.info(f"Admin {current_user['id']} unassigned errand {errand_id}")

    return {"message": "Errand unassigned successfully"}


@router.delete("/errands/{errand_id}")
async def delete_errand(
    errand_id: str,
    current_user: dict = Depends(require_admin)
):
    if not validate_object_id(errand_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid errand ID format"
        )

    errand = errands_collection.find_one({"_id": ObjectId(errand_id)})
    if not errand:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Errand not found"
        )

    if errand["status"] not in ["completed", "cancelled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete active errands. Cancel or complete them first."
        )

    result = errands_collection.delete_one({"_id": ObjectId(errand_id)})

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete errand"
        )

    logger.info(f"Admin {current_user['id']} deleted errand {errand_id}")

    return {"message": "Errand deleted successfully"}

@router.get("/agents/{agent_id}/verification-documents")
async def get_agent_verification_documents(
    agent_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Get verification documents submitted by an agent
    """
    if not validate_object_id(agent_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent ID format"
        )

    # Find the agent profile
    profile = None
    
    # First try as user_id
    profile = agent_profiles_collection.find_one({"user_id": agent_id})
    
    # If not found, try as profile _id
    if not profile and validate_object_id(agent_id):
        try:
            profile = agent_profiles_collection.find_one({"_id": ObjectId(agent_id)})
        except:
            pass
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent profile not found"
        )

    documents = []
    
    # Document mapping based on your actual schema
    document_fields = [
        {
            "url_field": "passport_photo_url",
            "public_id_field": "passport_photo_public_id",
            "label": "Passport Photograph",
            "type": "passport"
        },
        {
            "url_field": "nin_card_image_url",
            "public_id_field": "nin_card_public_id",
            "label": "NIN Card",
            "type": "nin_card"
        },
        {
            "url_field": "proof_of_address_url",
            "public_id_field": "proof_of_address_public_id",
            "label": "Proof of Address",
            "type": "proof_of_address"
        }
    ]
    
    # Check each document field
    for field in document_fields:
        url = profile.get(field["url_field"])
        if url:
            doc = {
                "type": field["type"],
                "label": field["label"],
                "url": url,
                "public_id": profile.get(field["public_id_field"]),
                "uploaded_at": profile.get("verification_submitted_at")
            }
            
            # Check if it's a PDF (based on URL or public_id)
            if url.lower().endswith('.pdf') or (profile.get(field["public_id_field"]) and 
                                                profile.get(field["public_id_field"]).lower().endswith('.pdf')):
                doc["is_pdf"] = True
            
            documents.append(doc)
    
    # Also check for any other URL fields that might contain documents
    for key, value in profile.items():
        if key.endswith('_url') and value and key not in [f["url_field"] for f in document_fields]:
            # Skip if we already added it
            if any(doc.get("url") == value for doc in documents):
                continue
                
            # Generate label from key
            label = key.replace('_url', '').replace('_', ' ').title()
            
            doc = {
                "type": "other",
                "label": label,
                "url": value,
                "public_id": profile.get(key.replace('_url', '_public_id')),
                "uploaded_at": profile.get("verification_submitted_at")
            }
            
            if value.lower().endswith('.pdf'):
                doc["is_pdf"] = True
            
            documents.append(doc)
    
    return {
        "agent_id": agent_id,
        "verification_status": profile.get("verification_status", "not_submitted"),
        "documents": documents,
        "submitted_at": profile.get("verification_submitted_at"),
        "verified_at": profile.get("verification_reviewed_at"),
        "rejection_reason": profile.get("verification_rejection_reason"),
        "nin_number": profile.get("nin_number")  # Include NIN if needed for reference
    }

@router.get("/agents/{agent_id}/download-document/{document_type}")
async def download_agent_document(
    agent_id: str,
    document_type: str,
    current_user: dict = Depends(require_admin)
):
    """
    Download agent verification document with proper filename and headers
    """
    # Find the agent profile
    profile = None
    
    # Try as user_id first
    profile = agent_profiles_collection.find_one({"user_id": agent_id})
    
    if not profile and validate_object_id(agent_id):
        try:
            profile = agent_profiles_collection.find_one({"_id": ObjectId(agent_id)})
        except:
            pass
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent profile not found"
        )
    
    # Map document types to URL fields and filenames
    doc_config = {
        "passport": {
            "url_field": "passport_photo_url",
            "filename": f"passport_photo_{agent_id}.pdf"
        },
        "nin_card": {
            "url_field": "nin_card_image_url",
            "filename": f"nin_card_{agent_id}.pdf"
        },
        "proof_of_address": {
            "url_field": "proof_of_address_url",
            "filename": f"proof_of_address_{agent_id}.pdf"
        }
    }
    
    if document_type not in doc_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document type"
        )
    
    config = doc_config[document_type]
    document_url = profile.get(config["url_field"])
    
    if not document_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # For Cloudinary URLs, we can proxy the request to set proper headers
    try:
        # Fetch the file from Cloudinary
        response = requests.get(document_url, stream=True)
        response.raise_for_status()
        
        # Get the content
        content = response.content
        
        # Create a streaming response with proper headers
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={config['filename']}",
                "Content-Type": "application/pdf",
                "Content-Length": str(len(content))
            }
        )
        
    except Exception as e:
        logger.error(f"Error downloading document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error downloading document"
        )