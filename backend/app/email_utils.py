import logging
import httpx

from app.database import settings

logger = logging.getLogger(__name__)


async def send_email(
    to_email: str,
    subject: str,
    body: str,
) -> None:
    """Send an email through Resend's HTTPS API (works on Render free web services)."""
    if not settings.resend_api_key or not settings.resend_from_email:
        raise RuntimeError(
            "Resend settings are incomplete. Configure RESEND_API_KEY and RESEND_FROM_EMAIL."
        )

    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": subject,
        "text": body,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()


async def send_otp_email(to_email: str, otp: str) -> None:
    await send_email(
        to_email=to_email,
        subject="Verify your Campus Lost-and-Found account",
        body=(
            "Hello,\n\n"
            f"Your email verification code is: {otp}\n\n"
            "This code expires in 10 minutes.\n\n"
            "If you did not request this code, ignore this email.\n\n"
            "Campus Lost-and-Found Portal"
        ),
    )


async def send_notification(
    to_email: str,
    subject: str,
    body: str,
) -> None:
    """Send a notification without failing the main API operation."""
    try:
        await send_email(to_email, subject, body)
    except Exception:
        logger.exception(
            "Email notification delivery failed for %s",
            to_email,
        )


