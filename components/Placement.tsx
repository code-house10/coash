"use client";
import { useState } from "react";
import { useT, post } from "@/lib/i18n";
import { SWIPE } from "@/lib/placement";
import { Call, type CallStart, type CallResult } from "./Call";

const ABOUT: [string, string][] = [["firstLang", "Your first language"], ["job", "Your job"], ["where", "Where do you use English day to day?"], ["interests", "Your interests"], ["why", "Why do you want better English?"]];
type Step = "about" | "quiz" | "write" | "talk" | "grading" | "done";

/** Placement as a short game: about you -> right/wrong quiz -> a few written lines -> 5-minute chat. */
export function Placement({ name, profile }: { name: string; profile: Record<string, string> }) {
  const t = useT();
  const [step, setStep] = useState<Step>("about");
  const [me, setMe] = useState({ name, profile });
  const [picks, setPicks] = useState<boolean[]>([]);
  const [text, setText] = useState("");
  const [call, setCall] = useState<CallStart | null>(null);
  const [result, setResult] = useState<{ level: string; why: string } | null>(null);
  const [err, setErr] = useState("");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  async function grade(r?: CallResult) {
    setCall(null); setStep("grading"); setErr("");
    try { setResult(await post("/api/placement", { action: "finish", picks, text, ...r })); setStep("done"); }
    catch (e) { fail(e); setStep("talk"); }
  }
  async function talk() {
    setErr("");
    try { const r = await post<Omit<CallStart, "title">>("/api/placement", { action: "speaking-start" }); setCall({ ...r, title: `🎙 ${t("5-minute conversation")}` }); } catch (e) { fail(e); }
  }

  if (call) return <Call start={call} onDone={grade} onError={(m) => { setCall(null); setErr(m); }} />;
  const q = SWIPE[picks.length];

  return (
    <div className="flex min-h-[80dvh] flex-col justify-center gap-4">
      {step === "about" && (
        <form className="card flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); try { await post("/api/profile", { ...me, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); setStep("quiz"); } catch (x) { fail(x); } }}>
          <h1 className="text-2xl font-black">{t("Let's find your level")}</h1>
          <p className="text-sm text-muted">{t("A game, not an exam. About 8 minutes. First, a little about you so sessions fit your life.")}</p>
          <label className="text-sm">{t("Your name")}<input className="input mt-1" required value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} /></label>
          {ABOUT.map(([k, l]) => <label key={k} className="text-sm">{t(l)}<input className="input mt-1" value={me.profile[k] ?? ""} onChange={(e) => setMe({ ...me, profile: { ...me.profile, [k]: e.target.value } })} /></label>)}
          <button className="btn grad">{t("Start")}</button>
        </form>
      )}
      {step === "quiz" && q && (
        <div className="card flex flex-col gap-4 text-center">
          <p className="text-sm text-muted">{t("Does this message sound right? Trust your gut.")} · {picks.length + 1}/{SWIPE.length}</p>
          <p dir="ltr" className="rounded-2xl bg-bg p-5 text-lg font-bold">{q.text}</p>
          <div className="grid grid-cols-2 gap-3">
            {[[true, "👍", "Sounds right"], [false, "👎", "Something is off"]].map(([v, icon, label]) => (
              <button key={String(v)} className="btn ghost" onClick={() => { const n = [...picks, v as boolean]; setPicks(n); if (n.length === SWIPE.length) setStep("write"); }}>{icon} {t(label as string)}</button>
            ))}
          </div>
        </div>
      )}
      {step === "write" && (
        <div className="card flex flex-col gap-3">
          <p className="font-black">{t("Your turn to text back")}</p>
          <p className="text-sm text-muted">{t("Write a few lines: what did you do last weekend, and what would you do with a free month?")}</p>
          <textarea dir="ltr" className="input min-h-32" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn grad" disabled={words < 15} onClick={() => setStep("talk")}>{words < 15 ? t("A few more words… ({n} to go)", { n: 15 - words }) : t("Send")}</button>
        </div>
      )}
      {step === "talk" && (
        <div className="card flex flex-col gap-3 text-center">
          <p className="text-5xl">🎙</p><p className="font-black">{t("5-minute conversation")}</p>
          <p className="text-sm text-muted">{t("Last part. Just a friendly chat so I can hear how you speak. Find a quiet spot and relax.")}</p>
          <button className="btn grad" onClick={talk}>{t("Start talking")}</button>
          <button className="btn ghost" onClick={() => grade()}>🙈 {t("Can't talk right now")}</button>
        </div>
      )}
      {step === "grading" && <div className="card text-center"><p className="grad pulse mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full text-4xl">🧭</p><p className="font-black">{t("Working out your level and writing your plan…")}</p></div>}
      {step === "done" && result && (
        <div className="card flex flex-col gap-3 text-center">
          <p className="text-sm text-muted">{t("Your starting stage")}</p><p className="text-6xl font-black text-brand">{result.level}</p><p>{result.why}</p>
          <a href="/" className="btn grad">{t("Go to my first session")}</a>
        </div>
      )}
      {err && <p className="text-center text-sm font-bold text-red-500">{err}</p>}
    </div>
  );
}
