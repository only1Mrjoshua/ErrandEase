import cloudinary
import cloudinary.uploader
import cloudinary.api
from typing import Optional, Tuple
import uuid
import logging
from config import settings

logger = logging.getLogger(__name__)

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True
)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
ALLOWED_DOCUMENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg", "application/pdf"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

def validate_image_file(file) -> bool:
    """Validate image file type and size"""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        return False
    
    # Check file size
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    
    return size <= MAX_FILE_SIZE

def validate_document_file(file) -> bool:
    """Validate document file type and size (allows PDF)"""
    if file.content_type not in ALLOWED_DOCUMENT_TYPES:
        return False
    
    # Check file size
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    
    return size <= MAX_FILE_SIZE

async def upload_to_cloudinary(file, folder: str, public_id_prefix: str) -> Optional[Tuple[str, str]]:
    """
    Upload file to Cloudinary
    Returns tuple of (secure_url, public_id) or None if failed
    """
    try:
        # Reset file pointer to beginning
        file.file.seek(0)
        
        # Read file content
        file_content = await file.read()
        
        # Generate public_id
        unique_id = uuid.uuid4().hex
        public_id = f"{settings.CLOUDINARY_UPLOAD_FOLDER}/{folder}/{public_id_prefix}_{unique_id}"
        
        # Determine resource type
        resource_type = "raw" if file.content_type == "application/pdf" else "image"
        
        # Upload to Cloudinary
        result = cloudinary.uploader.upload(
            file_content,
            public_id=public_id,
            resource_type=resource_type,
            type="upload"
        )
        
        logger.info(f"Uploaded to Cloudinary: {result['secure_url']}")
        return (result['secure_url'], result['public_id'])
        
    except Exception as e:
        logger.error(f"Cloudinary upload error: {e}")
        return None
    finally:
        # Reset file pointer
        await file.seek(0)

async def delete_from_cloudinary(public_id: str) -> bool:
    """Delete file from Cloudinary"""
    try:
        result = cloudinary.uploader.destroy(public_id)
        return result.get('result') == 'ok'
    except Exception as e:
        logger.error(f"Cloudinary delete error: {e}")
        return False