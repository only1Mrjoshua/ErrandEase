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
    
    # Agent assignment info - ALL FIELDS OPTIONAL
    assigned_agent_id: Optional[str] = None
    assigned_agent_name: Optional[str] = None
    accepted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None  # Made optional
    completed_at: Optional[datetime] = None  # Made optional
    completed_by: Optional[str] = None
    
    # Timestamps
    date_requested: Optional[datetime] = None
    date_completed: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
        # Allow extra fields to prevent validation errors
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