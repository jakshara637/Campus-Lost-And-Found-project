from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.database import engine as test_engine
from app import models
from app.routes.auth import create_access_token


def create_user(full_name, email, role="student"):
    with Session(test_engine) as db:
        user = models.User(
            full_name=full_name,
            email=email,
            password_hash="test-only-password-hash",
            role=role,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id


def create_item(owner_id, item_type="lost", status="open"):
    with Session(test_engine) as db:
        item = models.Item(
            title="Test backpack",
            description="A backpack used for automated testing.",
            category="Bags",
            location="Library",
            item_type=item_type,
            status=status,
            posted_by=owner_id,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item.id


def create_claim(item_id, claimant_id):
    with Session(test_engine) as db:
        claim = models.Claim(
            item_id=item_id,
            claimant_id=claimant_id,
            message="This item belongs to me.",
            status="pending",
        )
        db.add(claim)
        db.commit()
        db.refresh(claim)
        return claim.id


def auth_headers(user_id):
    return {
        "Authorization": f"Bearer {create_access_token(user_id)}"
    }


def update_payload():
    return {
        "title": "Updated backpack",
        "description": "Updated description for testing.",
        "category": "Bags",
        "location": "Cafeteria",
        "item_type": "lost",
        "status": "open",
    }


def test_create_report_requires_login(client: TestClient):
    response = client.post(
        "/items/",
        data={
            "title": "Test backpack",
            "description": "A backpack used for automated testing.",
            "category": "Bags",
            "location": "Library",
            "item_type": "lost",
        },
    )
    assert response.status_code == 401


def test_my_reports_requires_login(client: TestClient):
    response = client.get("/items/mine")
    assert response.status_code == 401


def test_user_cannot_update_another_users_report(client: TestClient):
    owner_id = create_user("Owner", "owner@example.com")
    other_id = create_user("Other", "other@example.com")
    item_id = create_item(owner_id)

    response = client.put(
        f"/items/{item_id}",
        json=update_payload(),
        headers=auth_headers(other_id),
    )

    assert response.status_code == 403

    with Session(test_engine) as db:
        item = db.get(models.Item, item_id)
        assert item.title == "Test backpack"
        assert item.posted_by == owner_id


def test_user_cannot_delete_another_users_report(client: TestClient):
    owner_id = create_user("Owner", "owner@example.com")
    other_id = create_user("Other", "other@example.com")
    item_id = create_item(owner_id)

    response = client.delete(
        f"/items/{item_id}",
        headers=auth_headers(other_id),
    )

    assert response.status_code == 403

    with Session(test_engine) as db:
        assert db.get(models.Item, item_id) is not None


def test_only_owner_can_list_item_claims(client: TestClient):
    owner_id = create_user("Owner", "owner@example.com")
    other_id = create_user("Other", "other@example.com")
    item_id = create_item(owner_id, item_type="found")

    response = client.get(
        f"/items/{item_id}/claims",
        headers=auth_headers(other_id),
    )

    assert response.status_code == 403


def test_only_owner_can_review_claim(client: TestClient):
    owner_id = create_user("Owner", "owner@example.com")
    other_id = create_user("Other", "other@example.com")
    claimant_id = create_user("Claimant", "claimant@example.com")

    item_id = create_item(
        owner_id,
        item_type="found",
        status="claim_requested",
    )
    claim_id = create_claim(item_id, claimant_id)

    response = client.patch(
        f"/claims/{claim_id}",
        json={"status": "approved"},
        headers=auth_headers(other_id),
    )

    assert response.status_code == 403

    with Session(test_engine) as db:
        claim = db.get(models.Claim, claim_id)
        item = db.get(models.Item, item_id)

        assert claim.status == "pending"
        assert item.status == "claim_requested"
