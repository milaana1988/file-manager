import { useEffect, useState } from "react";

export type Prefs = {
  view: "mine" | "all";
  sort: "date" | "size";
  order: "asc" | "desc";
  ftype: string;
  q: string;
  contentQ: string;
};

const DEFAULT_PREFS: Prefs = {
  view: "mine",
  sort: "date",
  order: "desc",
  ftype: "",
  q: "",
  contentQ: "",
};

function safeParse(json: string | null): Partial<Prefs> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Partial<Prefs>;
  } catch {
    return null;
  }
}

export function usePrefs(uid?: string) {
  const key = uid ? `fm:prefs:${uid}` : "";

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefs(DEFAULT_PREFS);
      return;
    }
    const saved = safeParse(localStorage.getItem(key));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(saved ? { ...DEFAULT_PREFS, ...saved } : DEFAULT_PREFS);
  }, [uid, key]);

  useEffect(() => {
    if (!uid) return;
    localStorage.setItem(key, JSON.stringify(prefs));
  }, [uid, key, prefs]);

  return { prefs, setPrefs };
}
