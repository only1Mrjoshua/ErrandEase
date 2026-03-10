from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import Optional, Tuple
from datetime import datetime
from bson import ObjectId
import uuid
import logging
import os

from database import agent_profiles_collection
from core.roles import require_agent
from core.cloudinary_utils import (
    validate_image_file, 
    validate_document_file, 
    upload_to_cloudinary
)
from schemas.agent import (
    AgentVerificationSubmitResponse
)

router = APIRouter(prefix="/api/agent", tags=["agent verification"])
logger = logging.getLogger(__name__)

@router.get("/profile/me")
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

@router.post("/verification/submit")
async def submit_verification(
    nin_number: str = Form(..., min_length=11, max_length=11, regex=r'^[0-9]{11}$'),
    passport_photo: UploadFile = File(...),
    nin_card_image: UploadFile = File(...),
    proof_of_address: UploadFile = File(...),
    current_user: dict = Depends(require_agent)
):
    """
    Submit verification documents to Cloudinary
    - passport_photo: must be image (JPEG, PNG, WebP)
    - nin_card_image: must be image (JPEG, PNG, WebP)
    - proof_of_address: can be image or PDF
    Stores both URLs and public_ids for future deletion if needed
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
    
    # Validate proof of address (can be image or PDF)
    if not validate_document_file(proof_of_address):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Proof of address must be a valid image (JPEG, PNG, WebP) or PDF and less than 5MB. Received: {proof_of_address.content_type}"
        )
    
    try:
        # Upload to Cloudinary - get both URL and public_id
        passport_result = await upload_to_cloudinary(
            passport_photo, 
            "passport", 
            f"agent_{current_user['id']}"
        )
        
        nin_card_result = await upload_to_cloudinary(
            nin_card_image, 
            "nincard", 
            f"agent_{current_user['id']}"
        )
        
        proof_result = await upload_to_cloudinary(
            proof_of_address, 
            "proof", 
            f"agent_{current_user['id']}"
        )
        
        # Check if any upload failed
        if not passport_result or not nin_card_result or not proof_result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to upload files to Cloudinary"
            )
        
        # Unpack results
        passport_url, passport_public_id = passport_result
        nin_card_url, nin_card_public_id = nin_card_result
        proof_url, proof_public_id = proof_result
        
        # Update profile with Cloudinary URLs and public_ids
        now = datetime.utcnow()
        result = agent_profiles_collection.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "nin_number": nin_number,
                    
                    # URLs for display
                    "passport_photo_url": passport_url,
                    "nin_card_image_url": nin_card_url,
                    "proof_of_address_url": proof_url,
                    
                    # Public IDs for future deletion if needed
                    "passport_photo_public_id": passport_public_id,
                    "nin_card_public_id": nin_card_public_id,
                    "proof_of_address_public_id": proof_public_id,
                    
                    "verification_status": "pending",
                    "verification_submitted_at": now,
                    "verification_rejection_reason": None,
                    "updated_at": now
                }
            },
            upsert=True
        )
        
        logger.info(f"Agent {current_user['id']} submitted verification documents to Cloudinary")
        
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
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit verification documents"
        )

@router.post("/verification/resubmit")
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

# Optional: Add endpoint to delete verification files
@router.post("/verification/delete-files")
async def delete_verification_files(current_user: dict = Depends(require_agent)):
    """
    Delete agent's uploaded verification files from Cloudinary
    Useful for cleanup or if agent wants to remove their data
    """
    profile = agent_profiles_collection.find_one({"user_id": current_user["id"]})
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent profile not found"
        )
    
    from core.cloudinary_utils import delete_from_cloudinary
    
    deleted = []
    
    # Delete each file if public_id exists
    if profile.get("passport_photo_public_id"):
        if await delete_from_cloudinary(profile["passport_photo_public_id"]):
            deleted.append("passport_photo")
    
    if profile.get("nin_card_public_id"):
        if await delete_from_cloudinary(profile["nin_card_public_id"]):
            deleted.append("nin_card")
    
    if profile.get("proof_of_address_public_id"):
        if await delete_from_cloudinary(profile["proof_of_address_public_id"]):
            deleted.append("proof_of_address")
    
    # Update profile to remove file references
    if deleted:
        update_data = {
            "verification_status": "not_submitted",
            "verification_rejection_reason": None,
            "updated_at": datetime.utcnow()
        }
        
        # Clear URL and public_id fields
        for file_type in ["passport_photo", "nin_card", "proof_of_address"]:
            update_data[f"{file_type}_url"] = None
            update_data[f"{file_type}_public_id"] = None
        
        agent_profiles_collection.update_one(
            {"user_id": current_user["id"]},
            {"$set": update_data}
        )
    
    return {
        "message": "Files deleted successfully",
        "deleted": deleted
    }