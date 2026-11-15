"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLang, post } from "@/lib/i18n";
import { Call, type CallStart, type CallResult } from "./Call";
import { LENGTHS } from "@/lib/shared";

export function SessionRunner({ pref, left, doneToday }: { pref: number; left: number; doneToday: boolean }) {
  const t = useT(), lang = useLang(), router = useRouter();
  const ok = (m: number) => m <= left;
  const [mins, setMins] = useState(ok(pref) ? pref : [...LENGTHS].reverse().find(ok) ?? LENGTHS[0]);
  const [call, setCall] = useState<CallStart | null>(null);
  const [phase, setPhase] = useState<"idle" | "starting" | "finishing">("idle");
  const [msg, setMsg] = useState("");
  const none = !LENGTHS.some(ok);

  async function begin() {
    setMsg(""); setPhase("starting");
    try {
      const r = await post("/api/session/start", { minutes: mins });
      setCall({ ...r, title: `${r.mode.emoji} ${lang === "ar" ? r.mode.nameAr : r.mode.name}`, subtitle: r.theme });
    } catch (e) { setMsg(t(e instanceof Error ? e.message : String(e))); }
    setPhase("idle");
  }

  async function finish(r: CallResult) {
    setCall(null); setPhase("finishing");
    try {
      const j = await post("/api/session/finish", r);
      if (j.status === "done") return router.push(`/reports/${j.reportId}?new=1${j.weeklyDue ? "&weekly=1" : ""}`);
      setMsg(t("That one was too short to write a report. No problem: start again whenever you like."));
    } catch { setMsg(t("The report could not be written. Your conversation is saved; please try again.")); }
    setPhase("idle"); router.refresh();
  }

  if (call) return <Call start={call} autosave onDone={finish} onError={(m) => { setCall(null); setMsg(m); }} />;
  if (phase === "finishing")
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-bg p-8 text-center">
        <div className="grad pulse flex h-28 w-28 items-center justify-center rounded-full text-5xl">📝</div>
        <p className="text-xl font-black">{t("Nice work. Writing your report…")}</p>
        <p className="text-muted">{t("This takes about ten seconds.")}</p>
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2">
        {LENGTHS.map((m) => <button key={m} className="chip" data-on={m === mins} disabled={!ok(m)} onClick={() => setMins(m)}>{m} {t("min")}</button>)}
      </div>
      <button className="grad btn flex h-44 w-44 flex-col items-center justify-center !rounded-full text-xl shadow-xl" disabled={none || phase !== "idle"} onClick={begin}>
        <span className="text-5xl">🎙</span>{t(phase === "starting" ? "Starting…" : doneToday ? "One more session" : "Start talking")}
      </button>
      {none && <p className="font-bold text-muted">{t("You have used today's coach minutes. See you tomorrow!")}</p>}
      {msg && <p className="text-center text-sm font-bold text-red-500">{msg}</p>}
    </div>
  );
}
