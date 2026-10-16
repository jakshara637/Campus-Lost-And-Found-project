from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session


class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    access_token_expire_minutes: int = 30
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
)


class Base(DeclarativeBase):
    pass


def get_db():
    with Session(engine) as db:
        yield db

        