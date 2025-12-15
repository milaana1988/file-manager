from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from app.schemas import ContentSearchResponse, FilesResponse, OkResponse, User
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.utils import _content_disposition
from .settings import settings
from .auth import get_user
from . import storage as gcs
from . import firestore as fs

from prometheus_fastapi_instrumentator import Instrumentator

# =========================
# App
# =========================
app = FastAPI(title="File Manager API")

Instrumentator().instrument(app).expose(app, endpoint="/metrics")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://file-management-e1e8c.web.app",
        "https://file-management-e1e8c.firebaseapp.com",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# =========================
# Dependency providers
# =========================
def get_db():
    # Firestore access layer (module)
    return fs


def get_storage():
    # GCS access layer (module)
    return gcs


def get_auth() -> Callable[[str | None], dict]:
    # provide validator callable (in prod: Firebase)
    return get_user


def get_current_user(
    authorization: str | None = Header(default=None),
    auth_fn: Callable[[str | None], dict] = Depends(get_auth),
) -> User:
    try:
        raw = auth_fn(authorization)
        return User(**raw)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")


# =========================
# Routes
# =========================
@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/api/files", response_model=FilesResponse)
async def upload_files(
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db=Depends(get_db),
    storage=Depends(get_storage),
):
    uid = user.uid

    out: list[dict[str, Any]] = []
    for f in files:
        if not storage.ext_ok(f.filename):
            raise HTTPException(
                status_code=400, detail=f"Unsupported file: {f.filename}")

        content = await f.read()

        obj_name, size = storage.upload_file(
            settings.gcs_bucket,
            uid,
            f.filename,
            content,
            f.content_type or "application/octet-stream",
        )

        doc = {
            "uid": uid,
            "name": f.filename,
            "name_lower": f.filename.lower(),
            "type": f.filename.rsplit(".", 1)[1].lower(),
            "size": size,
            "gcs_object": obj_name,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        file_id = db.create_file_doc(doc)
        out.append({"id": file_id, **doc})

    return {"items": out}


@app.get("/api/files", response_model=FilesResponse)
def list_files(
    sort: str = "date",        # date|size
    order: str = "desc",       # asc|desc
    ftype: str | None = None,  # json|txt|pdf
    q: str | None = None,      # name search
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    uid = user.uid

    col = db.db.collection("files").where("uid", "==", uid)
    if ftype:
        col = col.where("type", "==", ftype.lower())

    docs = [d.to_dict() | {"id": d.id} for d in col.stream()]

    if q:
        qq = q.lower()
        docs = [d for d in docs if qq in d.get("name_lower", "")]

    reverse = (order.lower() == "desc")
    if sort == "size":
        docs.sort(key=lambda x: x.get("size", 0), reverse=reverse)
    else:
        docs.sort(key=lambda x: x.get("created_at", ""), reverse=reverse)

    return {"items": docs}


def _is_probably_text(b: bytes) -> bool:
    # quick binary check (helps avoid scanning random bytes)
    return b"\x00" not in b


def _find_line_matches(text: str, needle: str, *, max_matches: int = 20) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    n = needle.lower()
    for i, line in enumerate(text.splitlines(), start=1):
        if n in line.lower():
            out.append({"line": i, "text": line[:400]})
            if len(out) >= max_matches:
                break
    return out


@app.get("/api/files/search-content", response_model=ContentSearchResponse)
def search_content(
    q: str,
    scope: str = "mine",  # mine|all
    max_results: int = 25,
    max_matches_per_file: int = 20,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
    storage=Depends(get_storage),
):
    """Search by text within files.

    Notes:
    - Supports .txt and .json (UTF-8-ish). PDFs are skipped.
    - Downloads are capped for safety (see storage.download_bytes).
    """
    qq = (q or "").strip()
    if not qq:
        raise HTTPException(status_code=400, detail="q is required")

    if scope not in {"mine", "all"}:
        raise HTTPException(status_code=400, detail="scope must be mine|all")

    if scope == "all" and not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # Pull candidate docs from Firestore
    if scope == "all":
        col = db.db.collection("files")
    else:
        col = db.db.collection("files").where("uid", "==", user.uid)

    docs = [d.to_dict() | {"id": d.id} for d in col.stream()]

    out: list[dict[str, Any]] = []
    skipped_pdf = 0
    truncated_files = 0

    # small optimization: check name_lower first (still do content scan)
    # keep deterministic order (newest first)
    docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    for meta in docs:
        ftype = (meta.get("type") or "").lower()
        if ftype == "pdf":
            skipped_pdf += 1
            continue

        # download capped bytes and scan
        raw = storage.download_bytes(
            settings.gcs_bucket, meta["gcs_object"], max_bytes=1_000_000)
        if len(raw) > 1_000_000:
            truncated_files += 1
            raw = raw[:1_000_000]

        if not _is_probably_text(raw):
            continue

        try:
            text = raw.decode("utf-8", errors="ignore")
        except Exception:
            continue

        matches = _find_line_matches(
            text, qq, max_matches=max_matches_per_file)
        if matches:
            out.append({"file": meta, "matches": matches})
            if len(out) >= max_results:
                break

    return {"q": qq, "items": out, "skipped_pdf": skipped_pdf, "truncated_files": truncated_files}


@app.get("/api/files/{file_id}/download")
def download(
    file_id: str,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
    storage=Depends(get_storage),
):
    meta = db.get_file(file_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Not found")

    # owner or admin can download
    if (meta["uid"] != user.uid) and (not user.is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")

    stream = storage.download_stream(settings.gcs_bucket, meta["gcs_object"])

    headers = {
        "Content-Disposition": _content_disposition(meta["name"]),
        "X-Content-Type-Options": "nosniff",
    }
    return StreamingResponse(
        stream,
        media_type="application/octet-stream",
        headers=headers,
    )


@app.delete("/api/files/{file_id}", response_model=OkResponse)
def delete(
    file_id: str,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
    storage=Depends(get_storage),
):
    meta = db.get_file(file_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Not found")

    # delete: only owner (even admin can't delete чужие)
    if meta["uid"] != user.uid:
        raise HTTPException(status_code=403, detail="Only owner can delete")

    storage.delete_object(settings.gcs_bucket, meta["gcs_object"])
    db.delete_file_doc(file_id)
    return {"ok": True}


@app.get("/api/admin/files", response_model=FilesResponse)
def admin_list(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    docs = [d.to_dict() | {"id": d.id}
            for d in db.db.collection("files").stream()]
    return {"items": docs}
