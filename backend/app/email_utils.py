import logging
from urllib.parse import quote

import httpx

from app.database import settings

logger = logging.getLogger(__name__)


async def send_email(
    to_email: str,
    subject: str,
    body: str,
) -> None:
    """Send transactional email through Nylas HTTPS API (Render free-tier compatible)."""
    if not settings.nylas_api_key:
        raise RuntimeError("NYLAS_API_KEY is not configured.")
    if not settings.nylas_domain:
        raise RuntimeError("NYLAS_DOMAIN is not configured.")
    if not settings.nylas_from_email:
        raise RuntimeError("NYLAS_FROM_EMAIL is not configured.")

    domain = settings.nylas_domain.strip().removeprefix("https://").removeprefix("http://").strip("/")
    if not domain or "/" in domain:
        raise RuntimeError("NYLAS_DOMAIN must be the verified domain only, without a URL or path.")

    api_base_url = settings.nylas_api_url.rstrip("/")
    encoded_domain = quote(domain, safe=".-")
    endpoint = f"{api_base_url}/v3/domains/{encoded_domain}/messages/send"

    headers = {
        "Authorization": f"Bearer {settings.nylas_api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    payload = {
        "from": {
            "name": settings.nylas_from_name,
            "email": settings.nylas_from_email,
        },
        "to": [{"email": to_email}],
        "subject": subject,
        "body": body,
        "is_plaintext": True,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(endpoint, headers=headers, json=payload)
        if response.is_error:
            logger.error(
                "Nylas email request failed: status=%s response=%s",
                response.status_code,
                response.text[:1500],
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
