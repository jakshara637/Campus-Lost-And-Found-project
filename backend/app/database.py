from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session


class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    access_token_expire_minutes: int = 30
    resend_api_key: str | None = None
    resend_from_email: str | None = None
    nylas_api_key: str | None = None
    nylas_domain: str | None = None
    nylas_from_email: str | None = None
    nylas_from_name: str = "CampusLoop"
    nylas_api_url: str = "https://api.us.nylas.com"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    session_secret_key: str | None = None
    frontend_origin: str = "http://localhost:5173"
    app_environment: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()

database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = database_url.replace(
        "postgres://",
        "postgresql+psycopg://",
        1,
    )
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace(
        "postgresql://",
        "postgresql+psycopg://",
        1,
    )

engine = create_engine(
    database_url,
    pool_pre_ping=True,
)


class Base(DeclarativeBase):
    pass


def get_db():
    with Session(engine) as db:
        yield db
