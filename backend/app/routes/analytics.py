from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/dashboard")
def dashboard_analytics(db: Session = Depends(get_db)):
    """Return aggregate, non-personal portal statistics for the dashboard."""
    total_reports = db.query(func.count(models.Item.id)).scalar() or 0
    lost_reports = (
        db.query(func.count(models.Item.id))
        .filter(models.Item.item_type == "lost")
        .scalar()
        or 0
    )
    found_reports = (
        db.query(func.count(models.Item.id))
        .filter(models.Item.item_type == "found")
        .scalar()
        or 0
    )
    resolved_reports = (
        db.query(func.count(models.Item.id))
        .filter(models.Item.status == "resolved")
        .scalar()
        or 0
    )
    open_reports = (
        db.query(func.count(models.Item.id))
        .filter(models.Item.status == "open")
        .scalar()
        or 0
    )
    claim_requested_reports = (
        db.query(func.count(models.Item.id))
        .filter(models.Item.status == "claim_requested")
        .scalar()
        or 0
    )
    total_claims = db.query(func.count(models.Claim.id)).scalar() or 0
    pending_claims = (
        db.query(func.count(models.Claim.id))
        .filter(models.Claim.status == "pending")
        .scalar()
        or 0
    )
    approved_claims = (
        db.query(func.count(models.Claim.id))
        .filter(models.Claim.status == "approved")
        .scalar()
        or 0
    )

    category_rows = (
        db.query(models.Item.category, func.count(models.Item.id).label("count"))
        .group_by(models.Item.category)
        .order_by(func.count(models.Item.id).desc(), models.Item.category.asc())
        .limit(6)
        .all()
    )

    now = datetime.now(timezone.utc)
    start_day = (now - timedelta(days=6)).date()
    items = (
        db.query(models.Item.created_at, models.Item.item_type)
        .filter(models.Item.created_at >= datetime.combine(
            start_day, datetime.min.time(), tzinfo=timezone.utc
        ))
        .all()
    )
    daily = {}
    for offset in range(7):
        day = start_day + timedelta(days=offset)
        daily[day.isoformat()] = {"date": day.isoformat(), "lost": 0, "found": 0}
    for created_at, item_type in items:
        if created_at is None:
            continue
        day_key = created_at.date().isoformat()
        if day_key in daily and item_type in ("lost", "found"):
            daily[day_key][item_type] += 1

    resolution_rate = round((resolved_reports / total_reports) * 100, 1) if total_reports else 0

    return {
        "overview": {
            "total_reports": total_reports,
            "lost_reports": lost_reports,
            "found_reports": found_reports,
            "resolved_reports": resolved_reports,
            "open_reports": open_reports,
            "claim_requested_reports": claim_requested_reports,
            "resolution_rate": resolution_rate,
            "total_claims": total_claims,
            "pending_claims": pending_claims,
            "approved_claims": approved_claims,
        },
        "categories": [
            {"category": category or "Uncategorized", "count": count}
            for category, count in category_rows
        ],
        "daily_activity": list(daily.values()),
        "generated_at": now.isoformat(),
    }
