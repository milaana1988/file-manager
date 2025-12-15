from google.cloud import firestore
from functools import lru_cache


@lru_cache
def _client():
    return firestore.Client()


class _DBProxy:
    @property
    def db(self):
        return _client()


db = _DBProxy()


def create_file_doc(data: dict) -> str:
    ref = db.collection("files").document()
    ref.set(data)
    return ref.id


def get_file(file_id: str) -> dict | None:
    snap = db.collection("files").document(file_id).get()
    return snap.to_dict() if snap.exists else None


def delete_file_doc(file_id: str):
    db.collection("files").document(file_id).delete()
