from tests.conftest import auth


def test_list_requires_auth(client):
    r = client.get("/api/files")
    assert r.status_code in (401, 403)


def test_upload_rejects_bad_extension(client):
    r = client.post(
        "/api/files",
        headers=auth("user"),
        files={"files": ("evil.exe", b"nope", "application/octet-stream")},
    )
    assert r.status_code == 400


def test_upload_and_list_and_delete_owner(client):
    r = client.post(
        "/api/files",
        headers=auth("user"),
        files={"files": ("a.json", b'{"a":1}', "application/json")},
    )
    assert r.status_code == 200
    file_id = r.json()["items"][0]["id"]

    r2 = client.get("/api/files", headers=auth("user"))
    assert r2.status_code == 200
    assert any(x["id"] == file_id for x in r2.json()["items"])

    r3 = client.delete(f"/api/files/{file_id}", headers=auth("user"))
    assert r3.status_code == 200

    r4 = client.get("/api/files", headers=auth("user"))
    assert r4.status_code == 200
    assert all(x["id"] != file_id for x in r4.json()["items"])


def test_admin_can_view_all_but_cant_delete_others(client):
    r = client.post(
        "/api/files",
        headers=auth("user"),
        files={"files": ("u.txt", b"hello", "text/plain")},
    )
    user_file_id = r.json()["items"][0]["id"]

    r2 = client.get("/api/admin/files", headers=auth("admin"))
    assert r2.status_code == 200
    assert any(x["id"] == user_file_id for x in r2.json()["items"])

    r3 = client.delete(f"/api/files/{user_file_id}", headers=auth("admin"))
    assert r3.status_code == 403


def test_download_admin_ok(client):
    r = client.post(
        "/api/files",
        headers=auth("user"),
        files={"files": ("x.txt", b"hello", "text/plain")},
    )
    file_id = r.json()["items"][0]["id"]

    r2 = client.get(f"/api/files/{file_id}/download", headers=auth("admin"))
    assert r2.status_code == 200
    assert r2.content == b"hello"
