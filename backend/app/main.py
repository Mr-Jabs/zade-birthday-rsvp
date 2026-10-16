import logging
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException

from app.config import get_settings
from app.database import get_session
from app.routes.event import router as event_router
from app.routes.rsvp import router as rsvp_router
from app.routes.auth import router as auth_router
from app.routes.admin import router as admin_router

app = FastAPI(title="Zade's Birthday API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Accept", "Content-Type", "Idempotency-Key", "X-CSRF-Token"],
)
app.include_router(event_router)
app.include_router(rsvp_router)
app.include_router(auth_router)
app.include_router(admin_router)


@app.middleware("http")
async def private_cache_policy(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/api/v1/admin", "/api/v1/auth")):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    error = exc.detail if isinstance(exc.detail, dict) else {
        "code": "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR", "message": str(exc.detail),
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": error},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    fields = {".".join(str(part) for part in error["loc"] if part not in ("body", "header")) or "party": error["msg"].removeprefix("Value error, ") for error in exc.errors()}
    return JSONResponse(status_code=400, content={"error": {"code": "VALIDATION_ERROR", "message": "Please check the supplied values.", "fields": fields}})


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc: SQLAlchemyError):
    # Log only the exception class; database exceptions may contain connection details.
    sqlstate = getattr(getattr(exc, "orig", None), "sqlstate", None)
    logging.getLogger(__name__).error("Database operation failed: %s (SQLSTATE=%s)", type(exc).__name__, sqlstate)
    if sqlstate in {"42P01", "42703"}:
        return JSONResponse(status_code=503, content={"error": {"code": "DATABASE_NOT_INITIALIZED", "message": "The party desk hasn’t finished setup. Please contact the organizer to complete setup."}})
    return JSONResponse(status_code=503, content={"error": {"code": "DATABASE_UNAVAILABLE", "message": "We couldn’t reach the party desk. Please try again shortly."}})


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}


@app.get("/api/ready", tags=["health"])
def ready(session: Annotated[Session, Depends(get_session)]):
    session.execute(text("SELECT 1"))
    return {"status": "ready", "database": "connected"}
