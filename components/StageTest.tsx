"use client";
import { useRef, useState } from "react";
import { useT, post } from "@/lib/i18n";
import { openMic, wav } from "@/lib/voice";

type Test = { target: string; passage: string; topic: string; questions: { q: string; options: string[] }[] };

/** Stage test: listen to a clip and answer 3 questions, then speak for 60 seconds. */
export function StageTest() {
  const t = useT();
  const [test, setTest] = useState<Test | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [plays, setPlays] = useState(2);
  const [rec, setRec] = useState(0); // seconds left while recording
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<{ passed: boolean; listening: number; feedback: string; level: string } | null>(null);
  const [err, setErr] = useState("");
  const stopRec = useRef<() => void>(() => {});
  const fail = (e: unknown) => { setErr(e instanceof Error ? e.message : String(e)); setBusy(""); };

  async function start() { setBusy(t("Preparing your test…")); setErr(""); try { setTest(await post("/api/stage", { action: "start" })); setBusy(""); } catch (e) { fail(e); } }
  function play() {
    const u = new SpeechSynthesisUtterance(test!.passage); u.lang = "en-US"; u.rate = 0.95;
    speechSynthesis.cancel(); speechSynthesis.speak(u); setPlays((n) => n - 1);
  }
  async function record() {
    setErr("");
    const chunks: Int16Array[] = [];
    try {
      const stop = await openMic((f) => chunks.push(Int16Array.from(f, (s) => Math.max(-32768, Math.min(32767, s * 32768)))));
      let left = 60; setRec(left);
      const timer = setInterval(() => { left--; setRec(left); if (left <= 0) stopRec.current(); }, 1000);
      stopRec.current = async () => {
        clearInterval(timer); stop(); setRec(0); stopRec.current = () => {};
        setBusy(t("Checking your answer…"));
        try {
          const f = new FormData(); f.append("file", wav(chunks), "monologue.wav");
          const r = await fetch("/api/stt", { method: "POST", body: f }); const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          setResult(await post("/api/stage", { action: "finish", answers, transcript: j.text })); setBusy("");
        } catch (e) { fail(e); }
      };
    } catch { setErr(t("The microphone is blocked. Allow microphone access for this site, then try again.")); }
  }

  if (busy) return <div className="card text-center font-black">{busy}</div>;
  if (result)
    return (
      <div className="card flex flex-col gap-3 text-center">
        <p className="text-6xl">{result.passed ? "🏆" : "💪"}</p>
        <p className="text-2xl font-black">{result.passed ? t("You moved up to {level}!", { level: result.level }) : t("Not yet. Close, though.")}</p>
        <p className="text-sm text-muted">{t("Listening")}: {result.listening}/3</p><p>{result.feedback}</p>
        <a href="/" className="btn grad">{t("Back to home")}</a>
      </div>
    );
  if (!test)
    return (
      <div className="card flex flex-col gap-3 text-center">
        <p className="text-5xl">⚔️</p><h1 className="text-2xl font-black">{t("Stage test")}</h1>
        <p className="text-sm text-muted">{t("Two parts: listen and answer three questions, then speak for one minute. About 4 minutes.")}</p>
        <button className="btn grad" onClick={start}>{t("Start")}</button>
        {err && <p className="text-sm font-bold text-red-500">{err}</p>}
      </div>
    );
  const listened = answers.filter((a) => a !== undefined).length === test.questions.length;
  return (
    <>
      <div className="card flex flex-col gap-3">
        <p className="font-black">1 · {t("Listening")}</p>
        <button className="btn ghost" disabled={plays <= 0} onClick={play}>▶ {t("Play the clip")} · {t("Plays left: {n}", { n: plays })}</button>
        {test.questions.map((q, i) => (
          <div key={i} dir="ltr" className="text-sm"><p className="mb-1 font-bold">{q.q}</p>
            <div className="flex flex-col gap-1">{q.options.map((o, j) => <button key={j} className="chip text-start" data-on={answers[i] === j} onClick={() => setAnswers((a) => Object.assign([...a], { [i]: j }))}>{o}</button>)}</div>
          </div>
        ))}
      </div>
      <div className="card flex flex-col gap-3">
        <p className="font-black">2 · {t("Speak for one minute")}</p><p dir="ltr" className="text-sm">{test.topic}</p>
        {rec ? <button className="btn grad pulse" onClick={() => stopRec.current()}>⏹ {t("Done")} · {rec}s</button>
          : <button className="btn grad" disabled={!listened} onClick={record}>🎙 {t("Start recording")}</button>}
        {err && <p className="text-sm font-bold text-red-500">{err}</p>}
      </div>
    </>
  );
}
