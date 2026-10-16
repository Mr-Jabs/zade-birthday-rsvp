import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import case, delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_session
from app.models import LoginThrottle, Organizer, OrganizerSession

COOKIE_NAME = "zade_organizer"
SESSION_SECONDS = 12 * 60 * 60


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=131072, r=8, p=1, maxmem=256 * 1024 * 1024).hex()
    return f"scrypt$131072${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        parts = stored.split("$")
        if len(parts) == 3:
            algorithm, salt, digest = parts
            cost = 16384  # Upgrade the initial development account on successful login.
        else:
            algorithm, cost, salt, digest = parts
            cost = int(cost)
        if algorithm != "scrypt" or cost not in (16384, 131072):
            return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=cost, r=8, p=1, maxmem=256 * 1024 * 1024).hex()
        return hmac.compare_digest(actual, digest)
    except (ValueError, TypeError):
        return False


# Unknown accounts still perform the same password derivation.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def check_origin(request: Request):
    allowed = {get_settings().frontend_origin.rstrip("/"), str(request.base_url).rstrip("/")}
    if request.headers.get("origin", "").rstrip("/") not in allowed:
        raise HTTPException(403, detail={"code": "ORIGIN_REJECTED", "message": "Please sign in from the organizer page."})


def check_login_limit(session: Session, request: Request):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=15)
    address = request.client.host if request.client else "unknown"
    key = hashlib.sha256(address.encode()).hexdigest()
    old = LoginThrottle.window_start < cutoff
    query = insert(LoginThrottle).values(key=key, attempts=1, window_start=now).on_conflict_do_update(
        index_elements=[LoginThrottle.key],
        set_={"attempts": case((old, 1), else_=LoginThrottle.attempts + 1), "window_start": case((old, now), else_=LoginThrottle.window_start)},
    ).returning(LoginThrottle.attempts)
    attempts = session.scalar(query)
    # Persist throttling even when authentication fails, across workers/restarts.
    session.commit()
    if attempts > 10:
        raise HTTPException(429, detail={"code": "LOGIN_THROTTLED", "message": "Too many sign-in attempts. Please try again in 15 minutes."}, headers={"Retry-After": "900"})
    return key


def create_session(session: Session, organizer: Organizer):
    now = datetime.now(timezone.utc)
    session.execute(delete(OrganizerSession).where(OrganizerSession.expires_at <= now))
    raw_token = secrets.token_urlsafe(32)
    record = OrganizerSession(
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(), organizer_id=organizer.id,
        csrf_token=secrets.token_urlsafe(32), expires_at=now + timedelta(seconds=SESSION_SECONDS),
    )
    session.add(record)
    return raw_token, record


def require_session(request: Request, session: Annotated[Session, Depends(get_session)]):
    token = request.cookies.get(COOKIE_NAME, "")
    if not token or len(token) > 128:
        raise HTTPException(401, detail={"code": "AUTH_REQUIRED", "message": "Please sign in to view the organizer dashboard."})
    record = session.get(OrganizerSession, hashlib.sha256(token.encode()).hexdigest())
    organizer = session.get(Organizer, record.organizer_id) if record else None
    if not record or record.expires_at <= datetime.now(timezone.utc) or not organizer or not organizer.is_active:
        raise HTTPException(401, detail={"code": "AUTH_REQUIRED", "message": "Your session has ended. Please sign in again."})
    return organizer, record


def require_csrf(request: Request, authenticated=Depends(require_session)):
    check_origin(request)
    if not hmac.compare_digest(request.headers.get("x-csrf-token", "").encode(), authenticated[1].csrf_token.encode()):
        raise HTTPException(403, detail={"code": "CSRF_REJECTED", "message": "Refresh the organizer page and try again."})
    return authenticated
