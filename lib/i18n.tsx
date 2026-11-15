"use client";
import { createContext, useContext } from "react";
import { makeT } from "./t";

const Ctx = createContext("en");
export const LangProvider = ({ lang, children }: { lang: string; children: React.ReactNode }) => <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
export const useLang = () => useContext(Ctx);
export const useT = () => makeT(useContext(Ctx));

export async function post<R = any>(url: string, body: unknown): Promise<R> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
