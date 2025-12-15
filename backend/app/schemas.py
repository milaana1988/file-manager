from pydantic import BaseModel, Field
from typing import Literal, Optional

FileType = Literal["json", "txt", "pdf"]


class User(BaseModel):
    uid: str
    email: Optional[str] = None
    is_admin: bool = False


class FileItem(BaseModel):
    id: str
    uid: str
    name: str
    name_lower: str
    type: FileType
    size: int
    gcs_object: str
    created_at: str


class FilesResponse(BaseModel):
    items: list[FileItem] = Field(default_factory=list)


class OkResponse(BaseModel):
    ok: bool = True


class ContentMatch(BaseModel):
    line: int
    text: str


class ContentSearchHit(BaseModel):
    file: FileItem
    matches: list[ContentMatch] = Field(default_factory=list)


class ContentSearchResponse(BaseModel):
    q: str
    items: list[ContentSearchHit] = Field(default_factory=list)
    skipped_pdf: int = 0
    truncated_files: int = 0
