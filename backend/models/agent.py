from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from bson import ObjectId

class AgentProfile(BaseModel):
    """
    Agent-specific profile information
    Extends the base User model with agent capabilities
    """
    id: Optional[str] = Field(None, alias="_id")
    user_id: str  # Reference to users collection
    business_name: Optional[str] = None
    phone_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_name: Optional[str] = None
    bvn_verified: bool = False
    id_verified: bool = False
    total_earnings: int = 0
    pending_earnings: int = 0
    completed_errands_count: int = 0
    rating: float = 0.0
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class AgentEarnings(BaseModel):
    """Track agent earnings per errand"""
    id: Optional[str] = Field(None, alias="_id")
    agent_id: str
    errand_id: str
    amount: int
    status: str  # pending, paid
    paid_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}