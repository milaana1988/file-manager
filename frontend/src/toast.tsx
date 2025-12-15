import React, { useCallback, useMemo, useState } from "react";
import { ToastContext } from "./toastStore";
import type { Toast, ToastKind, ToastCtx } from "./toastStore";

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

  const value = useMemo<ToastCtx>(() => ({ push, remove }), [push, remove]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={wrapStyle}>
        {toasts.map((t) => (
          <div key={t.id} style={{ ...toastStyle, ...kindStyle[t.kind] }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{t.title}</div>
            {t.message ? (
              <div style={{ opacity: 0.9, marginTop: 4, fontSize: 13 }}>
                {t.message}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
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
