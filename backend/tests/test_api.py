import pytest

from app import models
from app.routes.auth import create_access_token


def make_user(db, email, role="student"):
    user = models.User(
        full_name="Test User",
        email=email,
        password_hash="test-only-password-hash",
        role=role,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_item(db, owner_id, item_type="found", status="open"):
    item = models.Item(
        title="Black Backpack",
        description="A black backpack with a blue keychain",
        category="Bags",
        location="Library",
        item_type=item_type,
        status=status,
        posted_by=owner_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def auth_headers(user):
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def test_home_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["message"] == "Campus Lost-and-Found API is running!"


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_public_item_list_is_accessible(client):
    response = client.get("/items/")
    assert response.status_code == 200
    assert response.json() == []


def test_analytics_dashboard_returns_empty_counts(client):
    response = client.get("/analytics/dashboard")
    assert response.status_code == 200
    assert response.json()["overview"]["total_reports"] == 0
    assert response.json()["overview"]["total_claims"] == 0


@pytest.mark.parametrize("path", ["/auth/me", "/items/mine"])
def test_protected_endpoints_reject_unauthenticated_users(client, path):
    response = client.get(path)
    assert response.status_code == 401


def test_user_cannot_update_another_users_report(client, db_session):
    owner = make_user(db_session, "owner@example.test")
    other_user = make_user(db_session, "other@example.test")
    item = make_item(db_session, owner.id)

    payload = {
        "title": "Updated Backpack",
        "description": "Updated description of the backpack",
        "category": "Bags",
        "location": "Main Hall",
        "item_type": "found",
        "status": "open",
    }

    response = client.put(
        f"/items/{item.id}",
        json=payload,
        headers=auth_headers(other_user),
    )

    assert response.status_code == 403


def test_user_cannot_delete_another_users_report(client, db_session):
    owner = make_user(db_session, "owner@example.test")
    other_user = make_user(db_session, "other@example.test")
    item = make_item(db_session, owner.id)

    response = client.delete(
        f"/items/{item.id}",
        headers=auth_headers(other_user),
    )

    assert response.status_code == 403


def test_non_owner_cannot_list_claims_for_report(client, db_session):
    owner = make_user(db_session, "owner@example.test")
    other_user = make_user(db_session, "other@example.test")
    item = make_item(
        db_session,
        owner.id,
        item_type="found",
        status="claim_requested",
    )

    response = client.get(
        f"/items/{item.id}/claims",
        headers=auth_headers(other_user),
    )

    assert response.status_code == 403


def test_non_owner_cannot_review_claim(client, db_session):
    owner = make_user(db_session, "owner@example.test")
    claimant = make_user(db_session, "claimant@example.test")
    other_user = make_user(db_session, "other@example.test")
    item = make_item(
        db_session,
        owner.id,
        item_type="found",
        status="claim_requested",
    )

    claim = models.Claim(
        item_id=item.id,
        claimant_id=claimant.id,
        message="This backpack belongs to me because of its keychain.",
        status="pending",
    )
    db_session.add(claim)
    db_session.commit()
    db_session.refresh(claim)

    response = client.patch(
        f"/claims/{claim.id}",
        json={"status": "approved"},
        headers=auth_headers(other_user),
    )

    assert response.status_code == 403
