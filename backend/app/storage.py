import uuid
from google.cloud import storage

ALLOWED_EXT = {"json", "txt", "pdf"}


def ext_ok(filename: str) -> bool:
    parts = filename.rsplit(".", 1)
    return len(parts) == 2 and parts[1].lower() in ALLOWED_EXT


def upload_file(bucket_name: str, uid: str, filename: str, content: bytes, content_type: str):
    client = storage.Client()
    bucket = client.bucket(bucket_name)

    safe_name = filename.replace("/", "_")
    obj_name = f"users/{uid}/{uuid.uuid4().hex}_{safe_name}"
    blob = bucket.blob(obj_name)
    blob.upload_from_string(content, content_type=content_type)
    return obj_name, len(content)


def download_stream(bucket_name: str, obj_name: str):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(obj_name)
    return blob.open("rb")  # streaming file-like


def download_bytes(bucket_name: str, obj_name: str, *, max_bytes: int = 1_000_000) -> bytes:
    """Download up to `max_bytes` from an object.

    This is intentionally capped to keep text-search safe and predictable.
    """
    stream = download_stream(bucket_name, obj_name)
    try:
        return stream.read(max_bytes + 1)  # +1 so caller can detect truncation
    finally:
        try:
            stream.close()
        except Exception:
            pass


def delete_object(bucket_name: str, obj_name: str):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    bucket.blob(obj_name).delete()
