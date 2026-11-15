import { AR } from "./ar";

export type T = (en: string, vars?: Record<string, string | number>) => string;
/** English text is the key; Arabic comes from lib/ar.ts and falls back to English. */
export const makeT = (lang: string): T => (en, vars) => {
  let s = (lang === "ar" && AR[en]) || en;
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v));
  return s;
};
