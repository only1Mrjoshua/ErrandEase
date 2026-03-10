from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from bson import ObjectId

# Verification status enum
VerificationStatus = Literal["not_submitted", "pending", "approved", "rejected"]

# NEW: Account status enum
AccountStatus = Literal["active", "blocked", "suspended"]

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
    
    # NEW: Account status for blocking fraudulent agents
    account_status: AccountStatus = "active"
    blocked_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None
    blocked_by: Optional[str] = None  # Admin ID who blocked (or "system" for auto-block)
    appeal_status: Optional[str] = None  # "none", "pending", "approved", "rejected"
    appeal_submitted_at: Optional[datetime] = None
    appeal_message: Optional[str] = None
    
    # Verification fields
    verification_status: VerificationStatus = "not_submitted"
    passport_photo_url: Optional[str] = None
    passport_photo_public_id: Optional[str] = None
    nin_number: Optional[str] = None
    nin_card_image_url: Optional[str] = None
    nin_card_public_id: Optional[str] = None
    proof_of_address_url: Optional[str] = None
    proof_of_address_public_id: Optional[str] = None
    verification_submitted_at: Optional[datetime] = None
    verification_reviewed_at: Optional[datetime] = None
    verification_reviewed_by: Optional[str] = None
    verification_rejection_reason: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}