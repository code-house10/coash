"use client";
import { useState } from "react";
import { useT, post } from "@/lib/i18n";
import { VOICES, PALETTES, LENGTHS } from "@/lib/shared";

type U = { name: string; email: string; profile: Record<string, string>; theme: { mode: string; brand: string; accent: string }; voice: string; uiLang: string; reportLang: string; minutesPref: number; reminder: string };
const ABOUT: [string, string][] = [["firstLang", "Your first language"], ["job", "Your job"], ["where", "Where do you use English day to day?"], ["interests", "Your interests"], ["why", "Why do you want better English?"]];

export function Settings({ user, pushKey }: { user: U; pushKey: string }) {
  const t = useT();
  const [u, setU] = useState(user);
  const [note, setNote] = useState("");
  const [push, setPush] = useState("");

  /** Save one or more fields right away; the server accepts partial updates. */
  async function save(patch: Partial<U>, reload = false) {
    setU((x) => ({ ...x, ...patch })); setNote(t("Saving…"));
    try { await post("/api/profile", { ...patch, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); setNote(t("Saved")); if (reload) location.reload(); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
  }
  function theme(th: Partial<U["theme"]>) {
    const next = { ...u.theme, ...th }, r = document.documentElement;
    r.style.setProperty("--brand", next.brand); r.style.setProperty("--accent", next.accent); r.dataset.mode = next.mode;
    void save({ theme: next });
  }
  async function enablePush() {
    try {
      if ((await Notification.requestPermission()) !== "granted") return setPush(t("Notifications are blocked for this site in your browser settings."));
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKey });
      await post("/api/push/subscribe", { subscription: sub.toJSON() }); setPush(t("Notifications are on."));
    } catch (e) { setPush(e instanceof Error ? e.message : String(e)); }
  }
  const chips = <V extends string | number>(items: [V, string][], on: V, pick: (v: V) => void) => (
    <div className="flex flex-wrap gap-2">{items.map(([v, l]) => <button key={v} className="chip" data-on={v === on} onClick={() => pick(v)}>{l}</button>)}</div>
  );

  return (
    <>
      <div className="card flex flex-col gap-2">
        <p className="font-black">🎙 {t("Your coach's voice")}</p><p className="text-sm text-muted">{t("It is used from your next session.")}</p>
        {chips(VOICES.map(([id, ch]) => [id, `${id} · ${t(ch)}`]), u.voice, (voice) => save({ voice }))}
      </div>
      <div className="card flex flex-col gap-3">
        <p className="font-black">🎨 {t("Your colours")}</p>
        {chips([["auto", `🌗 ${t("Automatic")}`], ["light", `☀️ ${t("Light")}`], ["dark", `🌙 ${t("Dark")}`]], u.theme.mode, (mode) => theme({ mode }))}
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((p) => <button key={p.id} className="chip" data-on={p.brand === u.theme.brand && p.accent === u.theme.accent} onClick={() => theme(p)}><span className="me-1 inline-block h-3 w-3 rounded-full" style={{ background: `linear-gradient(120deg, ${p.brand}, ${p.accent})` }} />{t(p.id)}</button>)}
        </div>
        <div className="flex gap-4 text-sm">
          <label>{t("Main colour")} <input type="color" value={u.theme.brand} onChange={(e) => theme({ brand: e.target.value })} /></label>
          <label>{t("Second colour")} <input type="color" value={u.theme.accent} onChange={(e) => theme({ accent: e.target.value })} /></label>
        </div>
      </div>
      <div className="card flex flex-col gap-3">
        <p className="font-black">{t("Language")}</p>
        <p className="text-sm">{t("App language")}</p>{chips([["en", "English"], ["ar", "العربية"]], u.uiLang, (uiLang) => save({ uiLang }, true))}
        <p className="text-sm">{t("Language of your reports")}</p>{chips([["en", "English"], ["ar", "العربية"]], u.reportLang, (reportLang) => save({ reportLang }))}
      </div>
      <div className="card flex flex-col gap-3">
        <p className="font-black">{t("Sessions")}</p>
        <p className="text-sm">{t("Preferred session length")}</p>{chips(LENGTHS.map((m) => [m, `${m} ${t("min")}`]), u.minutesPref, (minutesPref) => save({ minutesPref }))}
        <p className="text-sm text-muted">{t("A weekly review rewrites your plan after every 7 sessions.")}</p>
      </div>
      <div className="card flex flex-col gap-3">
        <p className="font-black">{t("Reminders")}</p>
        <label className="text-sm">{t("Daily reminder time")} <input type="time" className="input mt-1" value={u.reminder} onChange={(e) => save({ reminder: e.target.value })} /></label>
        <a href="/api/reminder" className="btn ghost text-center">📅 {t("Add to calendar")}</a>
        {pushKey && <button className="btn ghost" onClick={enablePush}>🔔 {t("Turn on push notification")}</button>}
        {push && <p className="text-sm text-muted">{push}</p>}
      </div>
      <form className="card flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save({ name: u.name, profile: u.profile }); }}>
        <p className="font-black">{t("About you")}</p><p className="text-sm text-muted">{u.email}</p>
        <label className="text-sm">{t("Your name")}<input className="input mt-1" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></label>
        {ABOUT.map(([k, l]) => <label key={k} className="text-sm">{t(l)}<input className="input mt-1" value={u.profile[k] ?? ""} onChange={(e) => setU({ ...u, profile: { ...u.profile, [k]: e.target.value } })} /></label>)}
        <p className="text-xs text-muted">{t("Changes shape your next sessions. New themes arrive with your next weekly review.")}</p>
        <button className="btn grad">{t("Save settings")}</button>
      </form>
      {note && <p className="text-center text-sm text-muted">{note}</p>}
      <div className="card text-sm">
        <p className="font-black">🔒 {t("Privacy notice")}</p>
        <p className="text-muted">{t("Your voice conversations are processed by Google's Gemini. Please do not mention client names, confidential figures, passwords or anything private during a session.")}</p>
      </div>
      <a href="/placement?retake=1" className="btn ghost text-center">{t("Retake the placement test")}</a>
      <button className="btn ghost" onClick={async () => { await post("/api/logout", {}); location.assign("/login"); }}>{t("Sign out")}</button>
    </>
  );
}
