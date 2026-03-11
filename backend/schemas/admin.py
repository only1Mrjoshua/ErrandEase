from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime

# ==================== ADMIN LOGIN ====================

class AdminLoginRequest(BaseModel):
    """Admin login request - accepts email OR username + password"""
    username: str
    password: str

class AdminLoginResponse(BaseModel):
    """Admin login response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict

# ==================== ADMIN DASHBOARD STATS ====================

class DashboardStatsResponse(BaseModel):
    """Dashboard statistics response"""
    total_customers: int
    total_agents: int
    total_errands: int
    pending_errands: int
    accepted_errands: int
    in_progress_errands: int
    awaiting_confirmation_errands: int
    completed_errands: int
    cancelled_errands: int
    blocked_agents: int
    pending_verification_agents: int
    total_active_users: int

# ==================== CUSTOMER MANAGEMENT ====================

class CustomerCreateRequest(BaseModel):
    """Create customer manually"""
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)
    username: str = Field(..., min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    password: str = Field(..., min_length=8)
    phone_number: Optional[str] = Field(None, pattern=r'^\+?[0-9]{10,15}$')
    
    @validator('username')
    def validate_username(cls, v):
        if not v.isalnum() and '_' not in v:
            raise ValueError('Username can only contain letters, numbers, and underscores')
        return v.lower()

class CustomerUpdateRequest(BaseModel):
    """Update customer"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    username: Optional[str] = Field(None, min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    phone_number: Optional[str] = Field(None, pattern=r'^\+?[0-9]{10,15}$')
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8)

class CustomerResponse(BaseModel):
    """Customer response (safe for admin view)"""
    id: str
    email: str
    name: str
    username: str
    phone_number: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    errand_count: Optional[int] = None
    total_spent: Optional[int] = None
    
    class Config:
        from_attributes = True

# ==================== AGENT MANAGEMENT ====================

class AgentCreateRequest(BaseModel):
    """Create agent manually"""
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)
    username: str = Field(..., min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    password: str = Field(..., min_length=8)
    phone_number: Optional[str] = Field(None, pattern=r'^\+?[0-9]{10,15}$')
    business_name: Optional[str] = Field(None, max_length=100)

class AgentUpdateRequest(BaseModel):
    """Update agent"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    username: Optional[str] = Field(None, min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    phone_number: Optional[str] = Field(None, pattern=r'^\+?[0-9]{10,15}$')
    business_name: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8)
    account_status: Optional[str] = Field(None, pattern=r'^(active|blocked|suspended)$')
    verification_status: Optional[str] = Field(None, pattern=r'^(not_submitted|pending|approved|rejected)$')

class AdminAgentResponse(BaseModel):
    """Agent response for admin view (includes profile)"""
    id: str
    user_id: str
    email: str
    name: str
    username: str
    phone_number: Optional[str] = None
    business_name: Optional[str] = None
    role: str
    is_active: bool
    account_status: str
    verification_status: str
    id_verified: bool
    blocked_reason: Optional[str] = None
    total_earnings: int
    pending_earnings: int
    completed_errands_count: int
    rating: float
    created_at: datetime
    last_login: Optional[datetime] = None
    assigned_errands_count: Optional[int] = None
    
    class Config:
        from_attributes = True

# ==================== ERRAND MANAGEMENT ====================

class AdminErrandResponse(BaseModel):
    """Errand response for admin view (includes customer & agent info)"""
    id: str
    title: str
    description: str
    pickup: str
    delivery: str
    preferred_time: Optional[str] = None
    budget: int
    service_fee: int
    total_cost: int
    status: str
    
    # Customer info
    customer_id: str
    customer_name: str
    customer_email: str
    
    # Agent info (if assigned)
    assigned_agent_id: Optional[str] = None
    assigned_agent_name: Optional[str] = None
    assigned_agent_email: Optional[str] = None
    
    # Timestamps
    date_requested: Optional[datetime] = None
    date_completed: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class AdminErrandListResponse(BaseModel):
    """Errand list response for admin"""
    id: str
    title: str
    status: str
    total_cost: int
    date_requested: Optional[datetime] = None
    pickup: str
    delivery: str
    customer_name: str
    assigned_agent_name: Optional[str] = None
    
    class Config:
        from_attributes = True

class AssignErrandRequest(BaseModel):
    """Assign errand to agent request"""
    agent_id: str = Field(..., min_length=24, max_length=24)
    
    @validator('agent_id')
    def validate_object_id(cls, v):
        from bson import ObjectId
        if not ObjectId.is_valid(v):
            raise ValueError('Invalid agent ID format')
        return v

class AdminErrandFilterParams(BaseModel):
    """Filter parameters for errand listing"""
    status: Optional[str] = None
    customer_id: Optional[str] = None
    agent_id: Optional[str] = None
    search: Optional[str] = None
    limit: int = Field(50, ge=1, le=200)
    skip: int = Field(0, ge=0)

# ==================== PAGINATED RESPONSES ====================

class PaginatedCustomersResponse(BaseModel):
    """Paginated customer list response"""
    total: int
    page: int
    limit: int
    customers: List[CustomerResponse]

class PaginatedAgentsResponse(BaseModel):
    """Paginated agent list response"""
    total: int
    page: int
    limit: int
    agents: List[AdminAgentResponse]

class PaginatedErrandsResponse(BaseModel):
    """Paginated errand list response"""
    total: int
    page: int
    limit: int
    errands: List[AdminErrandListResponse]