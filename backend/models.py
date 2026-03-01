from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr

class User(BaseModel):
    email: EmailStr
    full_name: str
    google_id: Optional[str] = None
    profile_picture: Optional[str] = None
    created_at: datetime = datetime.utcnow()
    last_login: Optional[datetime] = None
    is_active: bool = True

class UserInDB(User):
    id: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class GoogleAuthRequest(BaseModel):
    token: str