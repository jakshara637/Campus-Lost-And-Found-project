import logging
from email.message import EmailMessage

import aiosmtplib

from app.database import settings

logger = logging.getLogger(__name__)


async def send_email(
    to_email: str,
    subject: str,
    body: str,
) -> None:
    if not all([
        settings.smtp_host,
        settings.smtp_username,
        settings.smtp_password,
        settings.smtp_from_email,
    ]):
        raise RuntimeError("Email SMTP settings are incomplete.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(body)

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password,
        start_tls=True,
        timeout=15,
    )


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


