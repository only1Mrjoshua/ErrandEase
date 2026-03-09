# Add this to your existing models.py after your existing models
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator
from bson import ObjectId  # Add this import

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
    preferred_time: Optional[str] = None  # ISO format time
    budget: int  # User-provided budget in Naira
    service_fee: int  # Calculated on backend
    total_cost: int  # Calculated on backend
    status: ErrandStatus
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
        json_encoders = {ObjectId: str}  # Now ObjectId is defined