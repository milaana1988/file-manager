import { createContext, useContext } from "react";

export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  ttlMs?: number;
};

export type ToastCtx = {
  push: (t: Omit<Toast, "id">) => void;
  remove: (id: string) => void;
};

export const ToastContext = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
