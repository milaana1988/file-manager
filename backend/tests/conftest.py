import io
import uuid
import datetime as dt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app, get_db, get_storage, get_auth


# -------------------------
# Firestore-like fakes
# -------------------------
class FakeDoc:
    def __init__(self, doc_id: str, data: dict):
        self.id = doc_id
        self._data = dict(data)

    def to_dict(self) -> dict:
        return dict(self._data)


class FakeQuery:
    def __init__(self, docs: list[FakeDoc]):
        self._docs = docs

    def where(self, field: str, op: str, value):
        if op != "==":
            raise NotImplementedError("FakeQuery supports only '=='")
        filtered = [d for d in self._docs if d.to_dict().get(field) == value]
        return FakeQuery(filtered)

    def stream(self):
        return list(self._docs)


class FakeFirestoreClient:
    def __init__(self, db_ref: "FakeDB"):
        self._db_ref = db_ref

    def collection(self, name: str):
        if name != "files":
            raise NotImplementedError("Only 'files' collection is supported")
        docs = [FakeDoc(doc_id, data)
                for doc_id, data in self._db_ref._files.items()]
        return FakeQuery(docs)


class FakeDB:
    def __init__(self):
        self._files: dict[str, dict] = {}
        self.db = FakeFirestoreClient(self)

    def create_file_doc(self, doc: dict) -> str:
        file_id = str(uuid.uuid4())
        self._files[file_id] = dict(doc)
        return file_id

    def get_file(self, file_id: str):
        data = self._files.get(file_id)
        if not data:
            return None
        return {"id": file_id, **data}

    def delete_file_doc(self, file_id: str) -> bool:
        return self._files.pop(file_id, None) is not None

    def query_files(self):
        return self.db.collection("files")


class FakeStorage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def ext_ok(self, filename: str) -> bool:
        if "." not in filename:
            return False
        ext = filename.rsplit(".", 1)[1].lower()
        return ext in {"json", "txt", "pdf"}

    def upload_file(self, bucket: str, uid: str, filename: str, content: bytes, content_type: str):
        key = f"{uid}/{filename}"
        self.objects[f"{bucket}/{key}"] = content
        return key, len(content)

    def download_stream(self, bucket: str, key: str):
        data = self.objects.get(f"{bucket}/{key}", b"")
        return io.BytesIO(data)

    def delete_object(self, bucket: str, key: str):
        self.objects.pop(f"{bucket}/{key}", None)


@pytest.fixture()
def fake_db():
    return FakeDB()


@pytest.fixture()
def fake_storage():
    return FakeStorage()


@pytest.fixture()
def client(fake_db, fake_storage):
    def fake_get_auth():
        def _auth(authorization: str | None):
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Unauthorized")

            token = authorization.split(" ", 1)[1].strip()
            if token == "admin":
                return {"uid": "admin_uid", "email": "admin@test.com", "is_admin": True}
            if token == "user":
                return {"uid": "user_uid", "email": "user@test.com", "is_admin": False}

            raise HTTPException(status_code=401, detail="Unauthorized")
        return _auth

    app.dependency_overrides[get_db] = lambda: fake_db
    app.dependency_overrides[get_storage] = lambda: fake_storage
    app.dependency_overrides[get_auth] = fake_get_auth   # <-- now this works

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
