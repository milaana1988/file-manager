import { useEffect, useMemo, useState } from "react";
import { usePrefs } from "./usePrefs";
import { useToast } from "./toast";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import {
  deleteFile,
  downloadFile,
  listAllFilesAdmin,
  listMyFiles,
  searchContent,
  uploadFiles,
  type FileItem,
  type ContentSearchResponse,
} from "./api";
import "./App.css";

type SortKey = "date" | "size";
type OrderKey = "asc" | "desc";
type ViewMode = "mine" | "all";

type UserState = {
  email: string;
  uid: string;
  token: string;
};

function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Unexpected error";
}

export default function App() {
  const [user, setUser] = useState<UserState | null>(null);

  const toast = useToast();

  const [items, setItems] = useState<FileItem[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Persisted UI preferences per user (localStorage).
  const { prefs, setPrefs } = usePrefs(user?.uid);

  const view = prefs.view;
  const sort = prefs.sort;
  const order = prefs.order;
  const ftype = prefs.ftype;
  const q = prefs.q;
  const contentQ = prefs.contentQ;

  const setView = (v: ViewMode) => setPrefs((p) => ({ ...p, view: v }));
  const setSort = (v: SortKey) => setPrefs((p) => ({ ...p, sort: v }));
  const setOrder = (v: OrderKey) => setPrefs((p) => ({ ...p, order: v }));
  const setFtype = (v: string) => setPrefs((p) => ({ ...p, ftype: v }));
  const setQ = (v: string) => setPrefs((p) => ({ ...p, q: v }));
  const setContentQ = (v: string) => setPrefs((p) => ({ ...p, contentQ: v }));

  const [contentRes, setContentRes] = useState<ContentSearchResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);

  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setErr("");
      if (!u) {
        setUser(null);
        setItems([]);
        setIsAdmin(false);
        setView("mine");
        return;
      }
      const token = await u.getIdToken();
      setUser({ email: u.email ?? "", uid: u.uid, token });
    });
    return () => unsub();
  }, []);

  async function refresh(mode: ViewMode = view): Promise<void> {
    if (!user) return;
    setErr("");
    setBusy(true);
    try {
      if (mode === "all") {
        const res = await listAllFilesAdmin(user.token);
        setItems(res.items);
      } else {
        const res = await listMyFiles(user.token, {
          sort,
          order,
          ftype: ftype || undefined,
          q: q || undefined,
        });
        setItems(res.items);
      }
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      if (mode === "all" && msg.includes("403")) {
        // not actually admin — fall back to normal view
        setIsAdmin(false);
        setView("mine");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function runContentSearch(): Promise<void> {
    if (!user) return;
    const qq = contentQ.trim();
    if (!qq) {
      setContentRes(null);
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const scope = view === "all" ? "all" : "mine";
      const res = await searchContent(user.token, { q: qq, scope, max_results: 25 });
      setContentRes(res);
      toast.push({ kind: "info", title: "Search finished", message: `${res.items.length} file(s) matched` });
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setErr(msg);
      toast.push({ kind: "error", title: "Error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  // Detect admin by calling admin endpoint once
  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        await listAllFilesAdmin(user.token);
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
        setView("mine");
      }
      await refresh("mine");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (user && view === "mine") {
      refresh("mine");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order, ftype]);

  // If user switches view (mine/all), keep content search results consistent
  useEffect(() => {
    setContentRes(null);
  }, [view]);

  const displayed = useMemo(() => {
    // In admin view we filter/search/sort on client for convenience
    if (view !== "all") return items;

    const qq = q.trim().toLowerCase();
    let arr = items;

    if (ftype.trim()) {
      arr = arr.filter((x) => x.type === ftype.trim().toLowerCase());
    }
    if (qq) {
      arr = arr.filter((x) => x.name.toLowerCase().includes(qq));
    }

    const dir = order === "desc" ? -1 : 1;
    return [...arr].sort((a, b) => {
      if (sort === "size") return dir * ((a.size || 0) - (b.size || 0));
      return dir * a.created_at.localeCompare(b.created_at);
    });
  }, [items, view, q, ftype, sort, order]);

  async function doLogin(): Promise<void> {
    setErr("");
    await signInWithPopup(auth, googleProvider);
  }

  async function doLogout(): Promise<void> {
    setErr("");
    await signOut(auth);
  }

  async function onUpload(files: FileList | null): Promise<void> {
    if (!user || !files || files.length === 0) return;
    setErr("");

    const arr = Array.from(files);
    const bad = arr.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return !ext || !["json", "txt", "pdf"].includes(ext);
    });

    if (bad.length) {
      setErr(
        `Only .json, .txt, .pdf allowed. Bad: ${bad
          .map((x) => x.name)
          .join(", ")}`
      );
      return;
    }

    setBusy(true);
    try {
      await uploadFiles(user.token, arr);
      toast.push({ kind: "success", title: "Upload complete", message: `${arr.length} file(s)` });
      // after upload, refresh current view (mine or all)
      await refresh(view);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setErr(msg);
      toast.push({ kind: "error", title: "Error", message: msg });
    } finally {
      setBusy(false);
      const el = document.getElementById(
        "file-input"
      ) as HTMLInputElement | null;
      if (el) el.value = "";
    }
  }

  async function onDelete(file: FileItem): Promise<void> {
    if (!user) return;
    setBusy(true);
    setErr("");
    try {
      await deleteFile(user.token, file.id);
      toast.push({ kind: "success", title: "Deleted", message: file.name });
      await refresh(view);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setErr(msg);
      toast.push({ kind: "error", title: "Error", message: msg });
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  }

  async function onDownload(file: FileItem): Promise<void> {
    if (!user) return;
    setBusy(true);
    setErr("");
    try {
      await downloadFile(user.token, file);
      toast.push({ kind: "info", title: "Download", message: file.name });
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setErr(msg);
      toast.push({ kind: "error", title: "Error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  const myUid = user?.uid ?? "";

  return (
    <div className="page">
      <div className="container">
        <header className="header">
          <div className="brand">
            <div className="h1">File Management App</div>
            <div className="subtitle">
              FastAPI + Cloud Run • Firebase Auth • GCS + Firestore
            </div>
          </div>

          {user ? (
            <div className="userbar">
              <span className="useremail" title={user.email}>
                {user.email}
              </span>
              <button
                className="btn btnGhost"
                onClick={doLogout}
                disabled={busy}
              >
                Logout
              </button>
            </div>
          ) : (
            <button className="btn" onClick={doLogin}>
              Sign in with Google
            </button>
          )}
        </header>

        {user ? (
          <section className="panel">
            <div className="panelTop">
              <div className="searchRow">
                <div className="searchWrap">
                  <input
                    className="input"
                    placeholder="Search by name…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && refresh(view)}
                  />
                  <button
                    className="btn btnGhost"
                    onClick={() => refresh(view)}
                    disabled={busy}
                  >
                    Refresh
                  </button>
                </div>

                <div className="searchWrap">
                  <input
                    className="input"
                    placeholder="Search inside files (.txt/.json)…"
                    value={contentQ}
                    onChange={(e) => setContentQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runContentSearch()}
                  />
                  <button
                    className="btn"
                    onClick={runContentSearch}
                    disabled={busy || !contentQ.trim()}
                  >
                    Search text
                  </button>
                  <button
                    className="btn btnGhost"
                    onClick={() => {
                      setContentQ("");
                      setContentRes(null);
                    }}
                    disabled={busy || (!contentQ && !contentRes)}
                  >
                    Clear
                  </button>
                </div>

                {isAdmin && (
                  <div className="segmented">
                    <button
                      className={`segBtn ${view === "mine" ? "segActive" : ""}`}
                      onClick={() => {
                        setView("mine");
                        refresh("mine");
                      }}
                      disabled={busy}
                    >
                      My files
                    </button>
                    <button
                      className={`segBtn ${view === "all" ? "segActive" : ""}`}
                      onClick={() => {
                        setView("all");
                        refresh("all");
                      }}
                      disabled={busy}
                    >
                      All files (admin)
                    </button>
                  </div>
                )}
              </div>

              <div className="filtersRow">
                <label className="field">
                  <span className="fieldLabel">Sort</span>
                  <select
                    className="select"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                  >
                    <option value="date">Date</option>
                    <option value="size">Size</option>
                  </select>
                </label>

                <label className="field">
                  <span className="fieldLabel">Order</span>
                  <select
                    className="select"
                    value={order}
                    onChange={(e) => setOrder(e.target.value as OrderKey)}
                  >
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                </label>

                <label className="field">
                  <span className="fieldLabel">Type</span>
                  <select
                    className="select"
                    value={ftype}
                    onChange={(e) => setFtype(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="json">json</option>
                    <option value="txt">txt</option>
                    <option value="pdf">pdf</option>
                  </select>
                </label>

                {/* Upload is allowed for everyone (including admins). Admin uploads only create files owned by admin. */}
                <label className="upload">
                  <input
                    id="file-input"
                    type="file"
                    multiple
                    accept=".json,.txt,.pdf"
                    onChange={(e) => onUpload(e.target.files)}
                    disabled={busy}
                  />
                  <span className="btn">Upload</span>
                </label>
              </div>

              {err && <div className="alert">{err}</div>}
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="emptyState">
              <div className="emptyTitle">Sign in to manage your files</div>
              <div className="emptyText">
                Upload .json/.txt/.pdf, search, filter, sort, download and
                delete.
              </div>
            </div>
          </section>
        )}

        {user && contentRes && (
          <section className="card" style={{ marginTop: 14 }}>
            <div className="cardTop">
              <div>
                <div className="cardTitle">Text search results</div>
                <div className="cardSub">
                  Query: <span className="mono">{contentRes.q}</span>
                  {contentRes.truncated_files > 0 && (
                    <span className="mono"> • truncated: {contentRes.truncated_files}</span>
                  )}
                  {contentRes.skipped_pdf > 0 && (
                    <span className="mono"> • skipped PDFs: {contentRes.skipped_pdf}</span>
                  )}
                </div>
              </div>
            </div>

            {contentRes.items.length === 0 ? (
              <div className="emptyState" style={{ padding: 16 }}>
                <div className="emptyText">No matches in .txt/.json files.</div>
              </div>
            ) : (
              <div style={{ padding: 12 }}>
                {contentRes.items.map((hit) => {
                  const f = hit.file;
                  return (
                    <div key={f.id} style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{f.name}</div>
                          <div className="mono" style={{ opacity: 0.85 }}>
                            {f.type} • {fmtBytes(f.size)}
                          </div>
                        </div>
                        <button className="btn btnGhost" onClick={() => onDownload(f)} disabled={busy}>
                          Download
                        </button>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        {hit.matches.slice(0, 10).map((m) => (
                          <div key={m.line} className="mono" style={{ opacity: 0.9, marginTop: 6 }}>
                            {m.line}: {m.text}
                          </div>
                        ))}
                        {hit.matches.length > 10 && (
                          <div className="mono" style={{ marginTop: 8, opacity: 0.7 }}>
                            +{hit.matches.length - 10} more matches…
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="card">
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Created</th>
                  {view === "all" && <th>Owner</th>}
                  <th className="thRight">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((f) => {
                  const isOwner = f.uid === myUid;
                  const deleteTitle =
                    view === "all" && !isOwner
                      ? "Admins cannot delete other users’ files"
                      : "Delete";

                  return (
                    <tr key={f.id}>
                      <td className="tdName" title={f.name}>
                        {f.name}
                      </td>
                      <td className="tdMono">{f.type}</td>
                      <td className="tdMono">{fmtBytes(f.size)}</td>
                      <td className="tdMono">
                        {new Date(f.created_at).toLocaleString()}
                      </td>
                      {view === "all" && (
                        <td className="tdMono">{f.uid.slice(0, 8)}…</td>
                      )}
                      <td className="tdActions">
                        <button
                          className="btn btnGhost"
                          onClick={() => onDownload(f)}
                          disabled={busy}
                        >
                          Download
                        </button>

                        <button
                          className="btn btnDanger"
                          onClick={() => setDeleteTarget(f)}
                          disabled={busy || (view === "all" && !isOwner)}
                          title={deleteTitle}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {user && displayed.length === 0 && (
                  <tr>
                    <td colSpan={view === "all" ? 6 : 5} className="tdEmpty">
                      No files yet. Upload something to get started.
                    </td>
                  </tr>
                )}

                {!user && (
                  <tr>
                    <td colSpan={view === "all" ? 6 : 5} className="tdEmpty">
                      Please sign in.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="footer">
          <span>Allowed types: .json, .txt, .pdf</span>
          <span className="dot">•</span>
          <span>Admins: can view all, delete only own</span>
        </footer>
      </div>

      {deleteTarget && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard">
            <div className="modalTitle">Delete file?</div>
            <div className="modalBody">
              <div className="mono">{deleteTarget.name}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                This action cannot be undone.
              </div>
            </div>
            <div className="modalActions">
              <button
                className="btn btnGhost"
                onClick={() => setDeleteTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="btn btnDanger"
                onClick={() => onDelete(deleteTarget)}
                disabled={busy}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div className="loaderOverlay">
          <div className="loaderCard">
            <div className="spinner" />
            <div className="loaderText">Please wait...</div>
          </div>
        </div>
      )}
    </div>
  );
}
