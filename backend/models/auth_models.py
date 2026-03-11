from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId

class PyObjectId:
    """Custom type for handling MongoDB ObjectId in Pydantic v2"""
    
    @classmethod
    def __get_pydantic_core_schema__(cls, source_type: Any, handler) -> Any:
        """Define how to validate and serialize ObjectId"""
        from pydantic_core import core_schema
        
        def validate(value: Any) -> ObjectId:
            if isinstance(value, ObjectId):
                return value
            if isinstance(value, str) and ObjectId.is_valid(value):
                return ObjectId(value)
            raise ValueError("Invalid ObjectId")
            
        return core_schema.no_info_after_validator_function(
            validate,
            core_schema.str_schema(),
            serialization=core_schema.to_string_ser_schema(),
        )

class AuthIdentity(BaseModel):
    provider: str  # "google", "email", etc.
    provider_sub: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class User(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    email: EmailStr
    name: str
    username: Optional[str] = None
    picture: Optional[str] = None
    password_hash: Optional[str] = None  # Only for email/password users
    auth_identities: List[AuthIdentity] = []
    role: str = "customer"  # customer, agent, admin
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class UserInDB(User):
    pass

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    username: Optional[str] = None
    picture: Optional[str] = None
    role: str
    is_new: bool = False
    
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict
    
    class Config:
        from_attributes = True

class RefreshToken(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    token: str
    user_id: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class GoogleTokenRequest(BaseModel):
    code: str
    state: str
    
    class Config:
        from_attributes = True

class GoogleUserInfo(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None
    sub: str
    email_verified: bool
    
    class Config:
        from_attributes = True