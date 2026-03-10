from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime

class ErrandCreate(BaseModel):
    """
    Schema for creating a new errand
    Only allows client to submit essential fields
    """
    title: str = Field(..., min_length=3, max_length=100)
    description: str = Field(..., max_length=500)
    pickup: str = Field(..., min_length=2, max_length=200)
    delivery: str = Field(..., min_length=2, max_length=200)
    preferred_time: Optional[str] = None
    budget: int = Field(..., ge=1000, le=1000000)
    
    @validator('title', 'description', 'pickup', 'delivery')
    def strip_strings(cls, v):
        return v.strip() if v else v

class ErrandResponse(BaseModel):
    """
    Schema for detailed errand response
    """
    id: str
    title: str
    description: str
    pickup: str
    delivery: str
    preferred_time: Optional[str]
    budget: int
    service_fee: int
    total_cost: int
    status: str  # Now includes "awaiting_confirmation"
    date_requested: Optional[datetime]
    date_completed: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    # Agent info (for customer view)
    assigned_agent_name: Optional[str] = None
    
    class Config:
        from_attributes = True

class ErrandListResponse(BaseModel):
    """
    Schema for list responses (minimal fields for performance)
    """
    id: str
    title: str
    status: str
    total_cost: int
    date_requested: Optional[datetime]
    pickup: str
    delivery: str
    
    class Config:
        from_attributes = True

# NEW: Completion confirmation schemas
class CompletionConfirmRequest(BaseModel):
    """
    Request to confirm errand completion
    """
    confirmed: bool
    rejection_reason: Optional[str] = None

class CompletionConfirmResponse(BaseModel):
    """
    Response after completion confirmation
    """
    message: str
    errand_status: str
    agent_blocked: bool = False