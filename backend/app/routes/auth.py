from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_session
from app.models import LoginThrottle, Organizer
from app.services.auth_service import COOKIE_NAME, DUMMY_PASSWORD_HASH, SESSION_SECONDS, check_login_limit, check_origin, create_session, hash_password, require_csrf, require_session, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["organizer authentication"])


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, session: Annotated[Session, Depends(get_session)]):
    check_origin(request)
    throttle_key = check_login_limit(session, request)
    organizer = session.scalar(select(Organizer).where(Organizer.username == payload.username.strip().lower()))
    valid = verify_password(payload.password, organizer.password_hash if organizer else DUMMY_PASSWORD_HASH)
    if not valid or not organizer or not organizer.is_active:
        raise HTTPException(401, detail={"code": "INVALID_CREDENTIALS", "message": "Username or password is incorrect."})
    if len(organizer.password_hash.split("$")) == 3:
        organizer.password_hash = hash_password(payload.password)
    # Rotate away from any prior browser session on a successful login.
    prior_token = request.cookies.get(COOKIE_NAME)
    if prior_token:
        import hashlib
        from app.models import OrganizerSession
        session.execute(delete(OrganizerSession).where(OrganizerSession.token_hash == hashlib.sha256(prior_token.encode()).hexdigest()))
    raw_token, record = create_session(session, organizer)
    session.execute(delete(LoginThrottle).where(LoginThrottle.key == throttle_key))
    session.commit()
    response.set_cookie(COOKIE_NAME, raw_token, max_age=SESSION_SECONDS, httponly=True, secure=get_settings().session_cookie_secure, samesite=get_settings().session_cookie_samesite, path="/api")
    return {"username": organizer.username, "csrf_token": record.csrf_token, "expires_at": record.expires_at}


@router.get("/me")
def me(authenticated=Depends(require_session)):
    organizer, record = authenticated
    return {"username": organizer.username, "csrf_token": record.csrf_token, "expires_at": record.expires_at}


@router.post("/logout", status_code=204)
def logout(response: Response, session: Annotated[Session, Depends(get_session)], authenticated=Depends(require_csrf)):
    session.delete(authenticated[1])
    session.commit()
    response.delete_cookie(COOKIE_NAME, path="/api", httponly=True, secure=get_settings().session_cookie_secure, samesite=get_settings().session_cookie_samesite)
