from fastapi import Header, HTTPException
import firebase_admin
from firebase_admin import auth, credentials
from .settings import settings

_app = None


def init_firebase():
    global _app
    if _app:
        return
    firebase_admin.initialize_app()
    _app = True


def get_user(authorization: str | None):
    init_firebase()
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    try:
        decoded = auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    uid = decoded.get("uid")
    email = decoded.get("email", "")
    claims = decoded.get("admin", False)

    allow = {e.strip().lower()
             for e in settings.admin_emails.split(",") if e.strip()}
    is_admin = bool(claims) or (email.lower() in allow)

    return {"uid": uid, "email": email, "is_admin": is_admin}
