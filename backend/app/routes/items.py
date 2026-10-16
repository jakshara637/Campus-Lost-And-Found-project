from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
)
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app import models
from app.database import get_db
from app.schemas import ItemResponse, ItemUpdate
from app.routes.auth import get_current_user
from app.email_utils import send_notification


router = APIRouter(prefix="/items", tags=["Items"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_SIZE = 5 * 1024 * 1024
ALLOWED_IMAGES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@router.post(
    "/",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_item(
    title: str = Form(min_length=2, max_length=150),
    description: str = Form(min_length=5),
    category: str = Form(min_length=2, max_length=80),
    location: str = Form(min_length=2, max_length=150),
    item_type: str = Form(pattern="^(lost|found)$"),
    image: UploadFile | None = File(default=None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    image_path = None
    saved_file = None

    if image is not None and image.filename:
        extension = ALLOWED_IMAGES.get(image.content_type)

        if extension is None:
            raise HTTPException(
                status_code=400,
                detail="Only JPEG, PNG, and WebP images are allowed.",
            )

        # Read at most 5 MB plus one byte to enforce the limit.
        image_bytes = await image.read(MAX_IMAGE_SIZE + 1)

        if len(image_bytes) > MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Image must be 5 MB or smaller.",
            )

        # Check the file signature rather than trusting its MIME type.
        valid_signature = (
            image_bytes.startswith(b"\xff\xd8\xff")
            if extension == ".jpg"
            else image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
            if extension == ".png"
            else (
                len(image_bytes) >= 12
                and image_bytes[:4] == b"RIFF"
                and image_bytes[8:12] == b"WEBP"
            )
        )

        if not valid_signature:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is not a valid supported image.",
            )

        filename = f"{uuid4().hex}{extension}"
        saved_file = UPLOAD_DIR / filename
        saved_file.write_bytes(image_bytes)
        image_path = f"/uploads/{filename}"

    item = models.Item(
        title=title,
        description=description,
        category=category,
        location=location,
        item_type=item_type,
        posted_by=current_user.id,
        image_path=image_path,
    )

    try:
        db.add(item)
        db.commit()
        db.refresh(item)
    except Exception:
        db.rollback()

        if saved_file is not None:
            saved_file.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail="Could not save the item.",
        )

    # The database transaction has succeeded.
    # Email failures must not undo the report.

    owner = current_user

    await send_notification(
        owner.email,
        "Your report was published",
        (
            f"Hello {owner.full_name},\n\n"
            f"Your {item.item_type} report has been published.\n\n"
            f"Title: {item.title}\n"
            f"Category: {item.category}\n"
            f"Location: {item.location}\n"
            f"Report ID: {item.id}\n\n"
            "You can view and manage your report in the "
            "Campus Lost-and-Found Portal."
        ),
    )

    subscribers = (
        db.query(models.User)
        .filter(
            models.User.is_verified.is_(True),
            models.User.email_new_post_alerts.is_(True),
            models.User.id != owner.id,
        )
        .all()
    )

    for subscriber in subscribers:
        await send_notification(
            subscriber.email,
            f"New {item.item_type} report: {item.title}",
            (
                f"Hello {subscriber.full_name},\n\n"
                "A new report has been published on the "
                "Campus Lost-and-Found Portal.\n\n"
                f"Type: {item.item_type}\n"
                f"Title: {item.title}\n"
                f"Category: {item.category}\n"
                f"Location: {item.location}\n\n"
                "Open the portal to view the report."
            ),
        )

    return item


@router.get("/", response_model=list[ItemResponse])
def list_items(
    q: str | None = Query(default=None, max_length=100),
    item_type: str | None = Query(
        default=None,
        pattern="^(lost|found)$",
    ),
    category: str | None = Query(default=None, max_length=80),
    location: str | None = Query(default=None, max_length=150),
    status_filter: str | None = Query(
        default=None,
        alias="status",
        max_length=30,
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(models.Item)

    # 1. Search title or description.
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.Item.title.ilike(keyword),
                models.Item.description.ilike(keyword),
            )
        )

    # 2. Filter by lost/found.
    if item_type:
        query = query.filter(
            models.Item.item_type == item_type
        )

    # 3. Filter by category (partial, case-insensitive).
    if category and category.strip():
        query = query.filter(
            models.Item.category.ilike(
                f"%{category.strip()}%"
            )
        )

    # 4. Filter by location (partial, case-insensitive).
    if location and location.strip():
        query = query.filter(
            models.Item.location.ilike(
                f"%{location.strip()}%"
            )
        )

    # 5. Filter by status (exact match).
    if status_filter and status_filter.strip():
        query = query.filter(
            models.Item.status.ilike(status_filter.strip())
        )

    # 6. Pagination and newest-first ordering.
    return (
        query
        .order_by(models.Item.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/mine", response_model=list[ItemResponse])
def list_my_items(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return only reports created by the authenticated user."""
    return (
        db.query(models.Item)
        .filter(models.Item.posted_by == current_user.id)
        .order_by(models.Item.created_at.desc())
        .all()
    )


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    item = db.get(models.Item, item_id)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Item not found",
        )

    return item


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    item_data: ItemUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.get(models.Item, item_id)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Item not found",
        )

    if item.posted_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only update your own reports.",
        )

    item.title = item_data.title
    item.description = item_data.description
    item.category = item_data.category
    item.location = item_data.location
    item.item_type = item_data.item_type
    item.status = item_data.status

    try:
        db.commit()
        db.refresh(item)
        return item
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update the item.",
        )


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.get(models.Item, item_id)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Item not found",
        )

    if item.posted_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only delete your own reports.",
        )

    image_path = item.image_path

    try:
        db.delete(item)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not delete the item.",
        )

    # Remove the uploaded image, if one exists.
    if image_path and image_path.startswith("/uploads/"):
        image_file = UPLOAD_DIR / Path(image_path).name

        if image_file.parent == UPLOAD_DIR:
            image_file.unlink(missing_ok=True)

    return


