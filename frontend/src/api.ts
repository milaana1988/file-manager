const API_BASE = import.meta.env.VITE_API_BASE_URL;

export type FileItem = {
  id: string;
  uid: string;
  name: string;
  type: "json" | "txt" | "pdf" | string;
  size: number;
  created_at: string;
};

export type ContentMatch = { line: number; text: string };
export type ContentSearchHit = { file: FileItem; matches: ContentMatch[] };
export type ContentSearchResponse = {
  q: string;
  items: ContentSearchHit[];
  skipped_pdf: number;
  truncated_files: number;
};

async function jsonFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${txt}`.trim());
  }
  return res.json() as Promise<T>;
}

export async function listMyFiles(
  token: string,
  params: Record<string, string | undefined>
) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
  return jsonFetch<{ items: FileItem[] }>(`/api/files?${q.toString()}`, token);
}

export async function searchContent(
  token: string,
  params: { q: string; scope: "mine" | "all"; max_results?: number }
) {
  const q = new URLSearchParams();
  q.set("q", params.q);
  q.set("scope", params.scope);
  if (params.max_results) q.set("max_results", String(params.max_results));
  return jsonFetch<ContentSearchResponse>(`/api/files/search-content?${q.toString()}`, token);
}

export async function listAllFilesAdmin(token: string) {
  return jsonFetch<{ items: FileItem[] }>(`/api/admin/files`, token);
}

export async function uploadFiles(token: string, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));

  return jsonFetch<{ items: FileItem[] }>(`/api/files`, token, {
    method: "POST",
    body: form,
  });
}

export async function deleteFile(token: string, fileId: string) {
  return jsonFetch<{ ok: boolean }>(`/api/files/${fileId}`, token, {
    method: "DELETE",
  });
}

export async function downloadFile(token: string, file: FileItem) {
  const res = await fetch(`${API_BASE}/api/files/${file.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${txt}`.trim());
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}
