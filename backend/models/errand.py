from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator
from bson import ObjectId

# Errand status enum
ErrandStatus = Literal["pending", "accepted", "in_progress", "completed", "cancelled"]

class Errand(BaseModel):
    """
    Errand model - source of truth for all errand data
    All cost calculations happen on backend only
    """
    id: Optional[str] = Field(None, alias="_id")
    user_id: str  # MongoDB ObjectId as string of the customer
    title: str
    description: str
    pickup: str
    delivery: str
    preferred_time: Optional[str] = None
    budget: int
    service_fee: int
    total_cost: int
    status: ErrandStatus
    
    # Agent assignment fields - NEW
    assigned_agent_id: Optional[str] = None  # Agent who accepted this errand
    assigned_agent_name: Optional[str] = None  # Denormalized for quick display
    accepted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_by: Optional[str] = None  # Agent ID who completed it
    completed_at: Optional[datetime] = None
    
    # Original timestamps
    date_requested: Optional[datetime] = None
    date_completed: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    @field_validator('budget')
    def validate_budget(cls, v):
        if v < 1000:
            raise ValueError('Budget must be at least ₦1,000')
        if v > 1000000:
            raise ValueError('Budget cannot exceed ₦1,000,000')
        return v
    
    @field_validator('title')
    def validate_title(cls, v):
        if not v or len(v.strip()) < 3:
            raise ValueError('Title must be at least 3 characters')
        if len(v) > 100:
            raise ValueError('Title cannot exceed 100 characters')
        return v.strip()
    
    @field_validator('description')
    def validate_description(cls, v):
        if v and len(v) > 500:
            raise ValueError('Description cannot exceed 500 characters')
        return v.strip() if v else v
    
    @field_validator('pickup', 'delivery')
    def validate_location(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError('Location must be at least 2 characters')
        if len(v) > 200:
            raise ValueError('Location cannot exceed 200 characters')
        return v.strip()
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}