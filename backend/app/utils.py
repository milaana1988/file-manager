from urllib.parse import quote


def _content_disposition(filename: str) -> str:
    # ASCII fallback (safe for latin-1 headers)
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii").strip()
    if not ascii_fallback:
        ascii_fallback = "download"

    # RFC 5987 UTF-8 filename (percent-encoded)
    utf8_name = quote(filename, safe="")

    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{utf8_name}"
