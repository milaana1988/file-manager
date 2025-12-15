import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  ttlMs?: number;
};

type ToastCtx = {
  push: (t: Omit<Toast, "id">) => void;
  remove: (id: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      const ttl = t.ttlMs ?? 3000;
      setToasts((arr) => [...arr, { ...t, id }]);
      window.setTimeout(() => remove(id), ttl);
    },
    [remove]
  );

  const value = useMemo(() => ({ push, remove }), [push, remove]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div style={wrapStyle}>
        {toasts.map((t) => (
          <div key={t.id} style={{ ...toastStyle, ...kindStyle[t.kind] }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{t.title}</div>
            {t.message ? (
              <div style={{ opacity: 0.9, marginTop: 4, fontSize: 13 }}>{t.message}</div>
            ) : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const wrapStyle: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  zIndex: 9999,
  maxWidth: 360,
};

const toastStyle: React.CSSProperties = {
  borderRadius: 14,
  padding: "10px 12px",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  background: "rgba(255, 255, 255, 0.92)",
  color: "rgba(15, 23, 42, 1)",
  boxShadow: "0 10px 30px rgba(2, 6, 23, 0.18)",
  backdropFilter: "blur(6px)",
};

const kindStyle: Record<ToastKind, React.CSSProperties> = {
  success: { borderColor: "rgba(34,197,94,0.35)" },
  error: { borderColor: "rgba(239,68,68,0.35)" },
  info: { borderColor: "rgba(59,130,246,0.35)" },
};
