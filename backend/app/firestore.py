from __future__ import annotations

from functools import lru_cache
from google.cloud import firestore


@lru_cache
def get_client() -> firestore.Client:
    return firestore.Client()


class FilesRepo:
    """Firestore access layer for file metadata."""

    def __init__(self, client: firestore.Client):
        self._c = client

    def create_file_doc(self, data: dict) -> str:
        ref = self._c.collection("files").document()
        ref.set(data)
        return ref.id

    def get_file(self, file_id: str) -> dict | None:
        snap = self._c.collection("files").document(file_id).get()
        return snap.to_dict() if snap.exists else None

    def delete_file_doc(self, file_id: str) -> None:
        self._c.collection("files").document(file_id).delete()

    def query_files(self):
        """Expose the collection query builder when you need filtering."""
        return self._c.collection("files")
