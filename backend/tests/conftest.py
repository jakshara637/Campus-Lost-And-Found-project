import os

# These test-only settings must be set before importing app.main.
# They override the real database settings from .env.
os.environ["DATABASE_URL"] = "sqlite:///./test_campus_lost_found_test.db"
os.environ["JWT_SECRET_KEY"] = "test-only-secret-key-for-automated-tests-123456"

from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
import pytest

from app.database import Base, engine, get_db
from app import models  # Ensure all models are registered with Base.
from app.main import app


def override_get_db():
    with Session(engine) as db:
        yield db


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def reset_test_database():
    # This engine points to the isolated SQLite test database.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    with Session(engine) as db:
        yield db
