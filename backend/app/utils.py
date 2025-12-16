from typing import Any
from urllib.parse import quote


def _content_disposition(filename: str) -> str:
    # ASCII fallback (safe for latin-1 headers)
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii").strip()
    if not ascii_fallback:
        ascii_fallback = "download"

    # RFC 5987 UTF-8 filename (percent-encoded)
    utf8_name = quote(filename, safe="")

    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{utf8_name}"


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
