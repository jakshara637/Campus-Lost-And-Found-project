import os

from starlette.middleware.sessions import SessionMiddleware
from app.database import settings

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from app.database import Base, engine
from app import models
from fastapi.staticfiles import StaticFiles
from app.routes.items import router as items_router, UPLOAD_DIR
from app.routes.auth import router as auth_router
from app.routes.claims import router as claims_router
from app.routes.analytics import router as analytics_router


Base.metadata.create_all(bind=engine)   # creates any missing tables when the application starts

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
)

app = FastAPI(
    title="Campus Lost-and-Found API",
    version="0.1.0",
)

# Allow the local Vite development server to call this API from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret_key or settings.jwt_secret_key,
    same_site="lax",
    https_only=False,  # Local development only
)

app.include_router(items_router)
app.include_router(auth_router)
app.include_router(claims_router)
app.include_router(analytics_router)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads",
)


@app.get("/")
def home():
    return {"message": "Campus Lost-and-Found API is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-check")
def database_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "connected",
            "database": "campus_lost_found",
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed. Check your configuration.",
        )

