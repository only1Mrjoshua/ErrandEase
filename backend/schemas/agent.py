from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime

class AgentSignupRequest(BaseModel):
    """
    Agent signup request - additional info beyond Google auth
    """
    business_name: Optional[str] = Field(None, max_length=100)
    phone_number: Optional[str] = Field(None, pattern=r'^\+?[0-9]{10,15}$')
    
    @validator('business_name')
    def validate_business_name(cls, v):
        if v and len(v.strip()) < 2:
            raise ValueError('Business name must be at least 2 characters')
        return v.strip() if v else v

class AgentProfileResponse(BaseModel):
    """
    Agent profile response (safe for agent to view)
    """
    id: str
    user_id: str
    business_name: Optional[str] = None
    phone_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_name: Optional[str] = None
    bvn_verified: bool
    id_verified: bool
    total_earnings: int
    pending_earnings: int
    completed_errands_count: int
    rating: float
    verification_status: str
    passport_photo_url: Optional[str] = None
    nin_number: Optional[str] = None  # Only included if agent viewing own profile
    nin_card_image_url: Optional[str] = None
    proof_of_address_url: Optional[str] = None
    verification_submitted_at: Optional[datetime] = None
    verification_rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class AgentVerificationStatusResponse(BaseModel):
    """
    Lightweight verification status response
    """
    user_id: str
    verification_status: str
    id_verified: bool
    rejection_reason: Optional[str] = None
    needs_verification: bool
    can_access_dashboard: bool

class AgentVerificationSubmitRequest(BaseModel):
    """
    Verification submission request (multipart form)
    """
    nin_number: str = Field(..., min_length=11, max_length=11, pattern=r'^[0-9]{11}$')
    
    @validator('nin_number')
    def validate_nin(cls, v):
        if not v.isdigit():
            raise ValueError('NIN must contain only digits')
        return v

class AgentVerificationSubmitResponse(BaseModel):
    """
    Response after verification submission
    """
    message: str
    status: str
    redirect_url: str

class AgentErrandResponse(BaseModel):
    """
    Agent view of an errand (includes customer info)
    """
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
    
    # Customer info (safe to share with agent)
    customer_name: str
    customer_phone: Optional[str] = None
    
    # Agent assignment info
    assigned_agent_id: Optional[str] = None
    assigned_agent_name: Optional[str] = None
    accepted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    
    # Timestamps
    date_requested: Optional[datetime] = None
    date_completed: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
        extra = "ignore"

class AvailableErrandResponse(BaseModel):
    """
    Minimal info for available errands list
    """
    id: str
    title: str
    pickup: str
    delivery: str
    total_cost: int
    date_requested: datetime
    customer_name: str
    
    class Config:
        from_attributes = True
        extra = "ignore"

class AssignedErrandResponse(BaseModel):
    """
    Minimal info for assigned errands list
    """
    id: str
    title: str
    pickup: str
    delivery: str
    total_cost: int
    status: str
    customer_name: str
    accepted_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
        extra = "ignore"

class AgentAcceptResponse(BaseModel):
    """
    Response after accepting an errand
    """
    message: str
    errand: AgentErrandResponse

class AgentEarningsResponse(BaseModel):
    """
    Agent earnings summary
    """
    total_earned: int
    pending_earnings: int
    completed_count: int
    average_per_errand: float
    this_week: int
    this_month: int
    
    class Config:
        from_attributes = True