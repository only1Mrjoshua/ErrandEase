from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import Optional
from datetime import datetime
from bson import ObjectId
import os
import shutil
import uuid
import logging
from pathlib import Path

from database import agent_profiles_collection
from core.roles import require_agent
from core.security import get_current_user
from schemas.agent import (
    AgentVerificationStatusResponse,
    AgentVerificationSubmitResponse,
    AgentProfileResponse
)

router = APIRouter(prefix="/api/agent", tags=["agent verification"])
logger = logging.getLogger(__name__)

# Upload configuration
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
ALLOWED_DOCUMENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg", "application/pdf"}  # PDF included
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
UPLOAD_DIR = Path(__file__).parent.parent / "uploads" / "agent_verification"

# Ensure upload directory exists
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def validate_image_file(file: UploadFile) -> bool:
    """Validate image file type and size"""
    # Check file type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        return False
    
    # Check file size
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    
    return size <= MAX_FILE_SIZE

def validate_document_file(file: UploadFile) -> bool:
    """Validate document file type and size (allows PDF)"""
    # Check file type
    if file.content_type not in ALLOWED_DOCUMENT_TYPES:
        return False
    
    # Check file size
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    
    return size <= MAX_FILE_SIZE

def save_upload_file(file: UploadFile, prefix: str) -> str:
    """Save uploaded file and return URL path"""
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1]
    if not ext:
        # If no extension, try to get from content type
        content_type_map = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'application/pdf': '.pdf'
        }
        ext = content_type_map.get(file.content_type, '')
    
    filename = f"{prefix}_{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / filename
    
    # Save file
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Return URL path
    return f"/uploads/agent_verification/{filename}"

@router.get("/profile/me", response_model=AgentProfileResponse)
async def get_my_profile(current_user: dict = Depends(require_agent)):
    """
    Get current authenticated agent's profile
    """
    profile = agent_profiles_collection.find_one({"user_id": current_user["id"]})
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent profile not found"
        )
    
    profile["id"] = str(profile.pop("_id"))
    return profile

@router.get("/verification/status")
async def get_verification_status(current_user: dict = Depends(require_agent)):
    """
    Get current agent's verification status
    """
    profile = agent_profiles_collection.find_one({"user_id": current_user["id"]})
    
    if not profile:
        # Create profile if missing
        from models.agent import AgentProfile
        new_profile = AgentProfile(user_id=current_user["id"])
        profile_dict = new_profile.model_dump(by_alias=True, exclude={"id"})
        result = agent_profiles_collection.insert_one(profile_dict)
        profile = agent_profiles_collection.find_one({"_id": result.inserted_id})
    
    return {
        "user_id": current_user["id"],
        "verification_status": profile.get("verification_status", "not_submitted"),
        "id_verified": profile.get("id_verified", False),
        "rejection_reason": profile.get("verification_rejection_reason"),
        "needs_verification": profile.get("verification_status") in ["not_submitted", "rejected"],
        "can_access_dashboard": profile.get("verification_status") == "approved"
    }

@router.post("/verification/submit", response_model=AgentVerificationSubmitResponse)
async def submit_verification(
    nin_number: str = Form(..., min_length=11, max_length=11, regex=r'^[0-9]{11}$'),
    passport_photo: UploadFile = File(...),
    nin_card_image: UploadFile = File(...),
    proof_of_address: UploadFile = File(...),
    current_user: dict = Depends(require_agent)
):
    """
    Submit verification documents
    - passport_photo: must be image (JPEG, PNG, WebP)
    - nin_card_image: must be image (JPEG, PNG, WebP)
    - proof_of_address: can be image or PDF
    """
    # Log file types for debugging
    logger.info(f"Passport photo type: {passport_photo.content_type}")
    logger.info(f"NIN card type: {nin_card_image.content_type}")
    logger.info(f"Proof of address type: {proof_of_address.content_type}")
    
    # Validate passport photo (must be image)
    if not validate_image_file(passport_photo):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Passport photo must be a valid image (JPEG, PNG, WebP) and less than 5MB. Received: {passport_photo.content_type}"
        )
    
    # Validate NIN card image (must be image)
    if not validate_image_file(nin_card_image):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"NIN card image must be a valid image (JPEG, PNG, WebP) and less than 5MB. Received: {nin_card_image.content_type}"
        )
    
    # Validate proof of address (can be image or PDF) - FIX: Use validate_document_file
    if not validate_document_file(proof_of_address):  # CHANGED: Now using validate_document_file
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Proof of address must be a valid image (JPEG, PNG, WebP) or PDF and less than 5MB. Received: {proof_of_address.content_type}"
        )
    
    try:
        # Save files
        passport_url = save_upload_file(passport_photo, "passport")
        nin_card_url = save_upload_file(nin_card_image, "nincard")
        proof_url = save_upload_file(proof_of_address, "proof")
        
        # Update profile
        now = datetime.utcnow()
        result = agent_profiles_collection.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "nin_number": nin_number,
                    "passport_photo_url": passport_url,
                    "nin_card_image_url": nin_card_url,
                    "proof_of_address_url": proof_url,
                    "verification_status": "pending",
                    "verification_submitted_at": now,
                    "verification_rejection_reason": None,
                    "updated_at": now
                }
            },
            upsert=True
        )
        
        logger.info(f"Agent {current_user['id']} submitted verification documents")
        
        # Determine redirect URL based on environment
        is_dev = os.getenv("ENVIRONMENT") != "production"
        if is_dev:
            redirect_url = "/frontend/agent-dashboard.html"
        else:
            redirect_url = "/agent-dashboard.html"
        
        return {
            "message": "Verification documents submitted successfully",
            "status": "pending",
            "redirect_url": redirect_url
        }
        
    except Exception as e:
        logger.error(f"Error submitting verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit verification documents"
        )

@router.post("/verification/resubmit", response_model=AgentVerificationSubmitResponse)
async def resubmit_verification(
    nin_number: str = Form(..., min_length=11, max_length=11, regex=r'^[0-9]{11}$'),
    passport_photo: UploadFile = File(...),
    nin_card_image: UploadFile = File(...),
    proof_of_address: UploadFile = File(...),
    current_user: dict = Depends(require_agent)
):
    """
    Resubmit verification documents after rejection
    """
    return await submit_verification(
        nin_number=nin_number,
        passport_photo=passport_photo,
        nin_card_image=nin_card_image,
        proof_of_address=proof_of_address,
        current_user=current_user
    )