import jwt
from pwdlib import PasswordHash
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jwt.exceptions import InvalidTokenError
from sqlalchemy.orm import Session

from app import models
from app.database import get_db, settings
from app.schemas import UserCreate, UserResponse, TokenResponse, NotificationPreferences

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from app.email_utils import send_otp_email
from app.schemas import ( RegistrationPendingResponse, ResendOTP, VerifyOTP )


router = APIRouter(prefix="/auth", tags=["Authentication"])
password_hash = PasswordHash.recommended()

oauth2_scheme = OAuth2PasswordBearer( tokenUrl="/auth/login" )

def hash_otp(email: str, otp: str) -> str:
    value = f"{email.lower()}:{otp}".encode()
    secret = settings.jwt_secret_key.encode()

    return hmac.new(
        secret,
        value,
        hashlib.sha256,
    ).hexdigest()


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"

def create_access_token(user_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    payload = {
        "sub": str(user_id),
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm="HS256",
    )


@router.post(
    "/register",
    response_model=RegistrationPendingResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
):
    email = str(user_data.email).strip().lower()

    existing_user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="This email is already registered.",
        )

    otp = generate_otp()
    now = datetime.now(timezone.utc)    

    user = models.User(
        full_name=user_data.full_name.strip(),
        email=email,
        password_hash=password_hash.hash(user_data.password),
        is_verified=False,
    )

    otp_record = models.EmailOTP(
        email=email,
        otp_hash=hash_otp(email, otp),
        expires_at=now + timedelta(minutes=10),
        created_at=now,
        attempts=0,
    )

    try:
        db.add(user)
        db.add(otp_record)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not start registration.",
        )

    try:
        await send_otp_email(email, otp)
    except Exception:
        # The pending account and OTP remain saved.
        # The user can request a new code using /resend-otp.
        raise HTTPException(
            status_code=503,
            detail="Email delivery failed. Check the email configuration and request a new OTP.",
        )

    return {
        "message": "A verification code has been sent to your email. It expires in 10 minutes."
    }


@router.post("/verify-otp")
def verify_email_otp(
    data: VerifyOTP,
    db: Session = Depends(get_db),
):
    email = str(data.email).strip().lower()

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    otp_record = (
        db.query(models.EmailOTP)
        .filter(models.EmailOTP.email == email)
        .first()
    )

    if user is None or user.is_verified:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification request.",
        )

    if otp_record is None:
        raise HTTPException(
            status_code=400,
            detail="No active verification code. Request a new one.",
        )

    now = datetime.now(timezone.utc)

    if otp_record.expires_at <= now:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="The verification code has expired. Request a new one.",
        )

    if otp_record.attempts >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Request a new code.",
        )

    submitted_hash = hash_otp(email, data.otp)

    if not hmac.compare_digest(
        submitted_hash,
        otp_record.otp_hash,
    ):
        otp_record.attempts += 1
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Incorrect verification code.",
        )

    user.is_verified = True
    db.delete(otp_record)
    db.commit()

    return {
        "message": "Email verified successfully. You can now log in."
    }


@router.post("/resend-otp")
async def resend_email_otp(
    data: ResendOTP,
    db: Session = Depends(get_db),
):
    email = str(data.email).strip().lower()

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    generic_response = {
        "message": "If an unverified account exists for this email, a new code will be sent."
    }

    if user is None or user.is_verified:
        return generic_response

    now = datetime.now(timezone.utc)

    otp_record = (
        db.query(models.EmailOTP)
        .filter(models.EmailOTP.email == email)
        .first()
    )

    if (
        otp_record is not None
        and (now - otp_record.created_at).total_seconds() < 60
    ):
        raise HTTPException(
            status_code=429,
            detail="Please wait at least 60 seconds before requesting another code.",
        )

    otp = generate_otp()

    if otp_record is None:
        otp_record = models.EmailOTP(
            email=email,
            otp_hash=hash_otp(email, otp),
            expires_at=now + timedelta(minutes=10),
            created_at=now,
            attempts=0,
        )
        db.add(otp_record)
    else:
        otp_record.otp_hash = hash_otp(email, otp)
        otp_record.expires_at = now + timedelta(minutes=10)
        otp_record.created_at = now
        otp_record.attempts = 0

    db.commit()

    try:
        await send_otp_email(email, otp)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Email delivery failed. Please try again later.",
        )

    return generic_response


@router.post("/login", response_model=TokenResponse)
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    email = form_data.username.strip().lower()

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    if user is None or not password_hash.verify(
        form_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in.",
        )

    token = create_access_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer",
    }


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:

    """
        validates the token and retrieves the corresponding database user. 
    """
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=["HS256"],
        )

        subject = payload.get("sub")

        if not isinstance(subject, str):
            raise credentials_exception

        user_id = int(subject)

    except (InvalidTokenError, ValueError):
        raise credentials_exception

    user = db.get(models.User, user_id)

    if user is None:
        raise credentials_exception

    return user


@router.get("/me", response_model=UserResponse)
def read_current_user(
    current_user: models.User = Depends(get_current_user),
):
    return current_user


@router.patch("/notification-preferences")
def update_notification_preferences(
    preferences: NotificationPreferences,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.email_new_post_alerts = (
        preferences.email_new_post_alerts
    )

    db.commit()
    db.refresh(current_user)

    return {
        "message": "Notification preferences updated.",
        "email_new_post_alerts": current_user.email_new_post_alerts,
    }

