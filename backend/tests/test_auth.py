
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models
from app.database import engine as test_engine
from app.routes import auth


def create_test_user(
    db: Session,
    email: str,
    password: str = "TestPassword123!",
    verified: bool = True,
) -> models.User:
    user = models.User(
        full_name="Test Student",
        email=email,
        password_hash=auth.password_hash.hash(password),
        role="student",
        is_verified=verified,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_login_rejects_incorrect_password(
    client: TestClient,
    db_session: Session,
):
    create_test_user(db_session, "wrongpass@example.com")

    response = client.post(
        "/auth/login",
        data={
            "username": "wrongpass@example.com",
            "password": "WrongPassword123!",
        },
    )

    assert response.status_code == 401


def test_login_rejects_unverified_user(
    client: TestClient,
    db_session: Session,
):
    create_test_user(
        db_session,
        "unverified@example.com",
        verified=False,
    )

    response = client.post(
        "/auth/login",
        data={
            "username": "unverified@example.com",
            "password": "TestPassword123!",
        },
    )

    assert response.status_code == 403


def test_verified_user_can_login(
    client: TestClient,
    db_session: Session,
):
    create_test_user(db_session, "verified@example.com")

    response = client.post(
        "/auth/login",
        data={
            "username": "verified@example.com",
            "password": "TestPassword123!",
        },
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


@pytest.mark.parametrize(
    "token",
    [
        "not-a-valid-token",
        "",
    ],
)
def test_current_user_rejects_invalid_token(
    client: TestClient,
    token: str,
):
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    response = client.get("/auth/me", headers=headers)

    assert response.status_code == 401


def test_registration_creates_unverified_account(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    async def fake_send_otp(email: str, otp: str) -> None:
        assert email == "newstudent@example.com"
        assert len(otp) == 6

    monkeypatch.setattr(auth, "send_otp_email", fake_send_otp)
    monkeypatch.setattr(auth, "generate_otp", lambda: "123456")

    response = client.post(
        "/auth/register",
        json={
            "full_name": "New Student",
            "email": "newstudent@example.com",
            "password": "StrongPassword123!",
        },
    )

    assert response.status_code == 202

    user = (
        db_session.query(models.User)
        .filter_by(email="newstudent@example.com")
        .first()
    )
    otp_record = (
        db_session.query(models.EmailOTP)
        .filter_by(email="newstudent@example.com")
        .first()
    )

    assert user is not None
    assert user.is_verified is False
    assert otp_record is not None
    assert otp_record.otp_hash != "123456"


def test_registration_rejects_duplicate_email(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    create_test_user(db_session, "duplicate@example.com")

    async def fake_send_otp(email: str, otp: str) -> None:
        pass

    monkeypatch.setattr(auth, "send_otp_email", fake_send_otp)

    response = client.post(
        "/auth/register",
        json={
            "full_name": "Another Student",
            "email": "duplicate@example.com",
            "password": "StrongPassword123!",
        },
    )

    assert response.status_code == 409


def test_otp_rejects_incorrect_code(
    client: TestClient,
    db_session: Session,
):
    email = "otpstudent@example.com"
    create_test_user(db_session, email, verified=False)

    now = datetime.now(timezone.utc)
    otp_record = models.EmailOTP(
        email=email,
        otp_hash=auth.hash_otp(email, "123456"),
        expires_at=now + timedelta(minutes=10),
        created_at=now,
        attempts=0,
    )
    db_session.add(otp_record)
    db_session.commit()

    response = client.post(
        "/auth/verify-otp",
        json={"email": email, "otp": "999999"},
    )

    assert response.status_code == 400

    db_session.refresh(otp_record)
    assert otp_record.attempts == 1


def test_otp_rejects_attempts_after_limit(
    client: TestClient,
    db_session: Session,
):
    email = "lockedotp@example.com"
    create_test_user(db_session, email, verified=False)

    now = datetime.now(timezone.utc)
    otp_record = models.EmailOTP(
        email=email,
        otp_hash=auth.hash_otp(email, "123456"),
        expires_at=now + timedelta(minutes=10),
        created_at=now,
        attempts=5,
    )
    db_session.add(otp_record)
    db_session.commit()

    response = client.post(
        "/auth/verify-otp",
        json={"email": email, "otp": "123456"},
    )

    assert response.status_code == 429
