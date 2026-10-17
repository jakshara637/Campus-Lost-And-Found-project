from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.routes.auth import get_current_user
from app.email_utils import send_notification
from app.schemas import ClaimCreate, ClaimResponse, ClaimReview


router = APIRouter(tags=["Claims"])

def check_item_owner(
    item: models.Item,
    user: models.User,
) -> None:
    if item.posted_by != user.id and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the report owner or an administrator can review claims.",
        )


@router.post(
    "/items/{item_id}/claims",          # Submit a claim for a found item
    response_model=ClaimResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_claim(
    item_id: int,
    claim_data: ClaimCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.get(models.Item, item_id)

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found.",
        )

    # A found-item report can be claimed by its owner, and a lost-item
    # report can be answered by someone who found the missing item.
    if item.item_type not in {"lost", "found"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This report type does not support claims.",
        )

    if item.posted_by == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot claim your own report.",
        )

    if item.status != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This item is not currently accepting claims.",
        )

    existing_claim = (
        db.query(models.Claim)
        .filter(
            models.Claim.item_id == item_id,
            models.Claim.claimant_id == current_user.id,
            models.Claim.status == "pending",
        )
        .first()
    )

    if existing_claim:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a pending claim for this item.",
        )

    claim = models.Claim(
        item_id=item_id,
        claimant_id=current_user.id,
        message=claim_data.message.strip(),
        status="pending",
    )

    item.status = "claim_requested"

    try:
        db.add(claim)
        db.commit()
        db.refresh(claim)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not submit the claim.",
        )

    owner = db.get(models.User, item.posted_by)

    # Confirmation to the student who submitted the claim.
    await send_notification(
        current_user.email,
        "Your claim was submitted",
        (
            f"Hello {current_user.full_name},\n\n"
            f"Your claim for '{item.title}' was submitted successfully.\n\n"
            f"Claim ID: {claim.id}\n"
            f"Claim status: {claim.status}\n\n"
            "You can view your claims in the Campus "
            "Lost-and-Found Portal."
        ),
    )

    # Notification to the owner of the found-item report.
    if owner is not None:
        await send_notification(
            owner.email,
            f"New claim for your report: {item.title}",
            (
                f"Hello {owner.full_name},\n\n"
                f"Someone has submitted a claim for '{item.title}'.\n\n"
                f"Claim ID: {claim.id}\n"
                f"Report ID: {item.id}\n\n"
                "Log in to the Campus Lost-and-Found Portal "
                "to review the claim."
            ),
        )

    return claim


@router.get(
    "/items/{item_id}/claims",          # Let the report owner review all claims for an item
    response_model=list[ClaimResponse],
)
def list_item_claims(
    item_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.get(models.Item, item_id)

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found.",
        )

    check_item_owner(item, current_user)

    return (
        db.query(models.Claim)
        .filter(models.Claim.item_id == item_id)
        .order_by(models.Claim.created_at.desc())
        .all()
    )


@router.get(
    "/claims/mine",     # Let a student see their own claims
    response_model=list[ClaimResponse],
)
def list_my_claims(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Claim)
        .filter(models.Claim.claimant_id == current_user.id)
        .order_by(models.Claim.created_at.desc())
        .all()
    )


@router.patch(          
    "/claims/{claim_id}",       # Approve or reject a claim 
    response_model=ClaimResponse,
)       
async def review_claim(           
    claim_id: int,
    review_data: ClaimReview,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    claim = db.get(models.Claim, claim_id)

    if claim is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Claim not found.",
        )

    item = db.get(models.Item, claim.item_id)

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The report associated with this claim no longer exists.",
        )

    check_item_owner(item, current_user)

    if claim.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This claim has already been reviewed.",
        )

    if item.status != "claim_requested":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This item is not accepting claim decisions.",
        )

    auto_rejected_claims = []

    try:
        claim.status = review_data.status

        if review_data.status == "approved":
            item.status = "resolved"

            auto_rejected_claims = (
                db.query(models.Claim)
                .filter(
                    models.Claim.item_id == item.id,
                    models.Claim.id != claim.id,
                    models.Claim.status == "pending",
                )
                .all()
            )

            for other_claim in auto_rejected_claims:
                other_claim.status = "rejected"

        else:
            remaining_pending = (
                db.query(models.Claim)
                .filter(
                    models.Claim.item_id == item.id,
                    models.Claim.id != claim.id,
                    models.Claim.status == "pending",
                )
                .count()
            )

            if remaining_pending == 0:
                item.status = "open"

        db.commit()
        db.refresh(claim)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update the claim.",
        )

    claimant = db.get(models.User, claim.claimant_id)

    if claimant is not None:
        await send_notification(
            claimant.email,
            f"Claim {claim.status}: {item.title}",
            (
                f"Hello {claimant.full_name},\n\n"
                f"Your claim for '{item.title}' has been "
                f"{claim.status}.\n\n"
                f"Claim ID: {claim.id}\n"
                f"Report ID: {item.id}\n\n"
                "Log in to the Campus Lost-and-Found Portal "
                "to view the latest status."
            ),
        )

    for rejected_claim in auto_rejected_claims:
        rejected_user = db.get(
            models.User,
            rejected_claim.claimant_id,
        )

        if rejected_user is not None:
            await send_notification(
                rejected_user.email,
                f"Claim rejected: {item.title}",
                (
                    f"Hello {rejected_user.full_name},\n\n"
                    f"Your claim for '{item.title}' was rejected "
                    "because another claim was approved for this item.\n\n"
                    f"Claim ID: {rejected_claim.id}\n"
                    f"Report ID: {item.id}\n\n"
                    "Log in to the Campus Lost-and-Found Portal "
                    "to view your claims."
                ),
            )

    return claim


