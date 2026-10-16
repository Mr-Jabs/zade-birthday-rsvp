"""Create a local organizer with a generated password, without printing secrets."""
import argparse
import getpass
import secrets
from pathlib import Path

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Organizer
from app.services.auth_service import hash_password


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default="organizer")
    parser.add_argument("--set-password", action="store_true", help="Set/reset the password through a hidden prompt; revoke existing sessions.")
    args = parser.parse_args()
    username = args.username.strip().lower()
    if not username or len(username) > 80:
        raise ValueError("Choose a username of 1–80 characters.")
    password = getpass.getpass("New organizer password (12+ characters): ") if args.set_password else secrets.token_urlsafe(18)
    if len(password) < 12 or len(password) > 256:
        raise ValueError("Use a password of 12–256 characters.")
    with SessionLocal.begin() as session:
        organizer = session.scalar(select(Organizer).where(Organizer.username == username))
        if organizer and not args.set_password:
            print("Organizer already exists; credentials preserved.")
            return
        if organizer:
            from sqlalchemy import delete
            from app.models import OrganizerSession
            organizer.password_hash = hash_password(password)
            session.execute(delete(OrganizerSession).where(OrganizerSession.organizer_id == organizer.id))
        else:
            session.add(Organizer(username=username, password_hash=hash_password(password)))
    if not args.set_password:
        destination = Path(__file__).resolve().parents[3] / ".local" / "organizer-credentials.txt"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(f"Organizer dashboard: http://127.0.0.1:5173/admin.html\nUsername: {username}\nPassword: {password}\n", encoding="utf-8")
        print("Organizer created. Generated credentials saved in .local/organizer-credentials.txt (ignored by Git).")
    else:
        print("Organizer password updated; existing sessions revoked.")


if __name__ == "__main__":
    main()
