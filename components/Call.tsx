"use client";
import { useEffect, useRef, useState } from "react";
import { useT, post } from "@/lib/i18n";
import { VoiceSession, type VoiceState } from "@/lib/voice";
import { CUES, type Turn } from "@/lib/shared";

export type CallStart = {
  sessionId: number; speechRate?: number; title: string; subtitle?: string;
  /** Opening stage direction. When set, the call is a free-form drill: no warm-up/main/mistake-hunt phases. */
  firstCue?: string;
  /** Role-play scenes the learner steps through. The first one's cue belongs in firstCue; "Next scene" sends the others. */
  scenes?: { title: string; cue: string; targets: { front: string; back: string }[] }[];
  timeline: { warmupMs: number; mistakesAtMs?: number | null; wrapAtMs: number; hardStopMs: number };
};
export type CallResult = { sessionId: number; turns: Turn[]; actualSeconds: number; speakingSeconds: number; provider: string; failovers: number };

// Coach pace: [label, audio playback rate (also the browser-voice rate in backup mode), stage direction for the live voice].
// Asking the voice to slow down only goes so far, so the two slowest settings also stretch the audio itself.
const SLOWLY = "very slowly and clearly: short sentences, and a clear pause after every few words";
const SPEEDS = [["Slowest", 0.78, SLOWLY], ["Very slow", 0.88, SLOWLY], ["Slow", 1, "slowly and clearly"], ["Normal", 1, "at a natural pace"]] as const;
const NORMAL = SPEEDS.length - 1;
const savedSpeed = () => { try { const n = Number(localStorage.getItem("coachPace") ?? NORMAL); return Number.isInteger(n) && n >= 0 && n < NORMAL ? n : NORMAL; } catch { return NORMAL; } };
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Full-screen voice call. Runs the session clock, sends stage cues, and reports the result once. */
export function Call({ start, autosave, onDone, onError }: { start: CallStart; autosave?: boolean; onDone: (r: CallResult) => void; onError: (m: string) => void }) {
  const t = useT();
  const vs = useRef<VoiceSession | null>(null);
  const done = useRef(false);
  const [state, setState] = useState<[string, VoiceState]>(["gemini", "connecting"]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ms, setMs] = useState(0);
  const { timeline: tl } = start;
  const [speed, setSpeed] = useState<number>(NORMAL);
  const [tr, setTr] = useState<{ src: string; text: string } | null>(null);
  const scenes = start.scenes ?? [];
  const [scene, setScene] = useState(0);
  const [hints, setHints] = useState(false);

  function nextScene() {
    const n = scene + 1, s = vs.current;
    if (!s || n >= scenes.length) return;
    setScene(n); setHints(false); setTr(null);
    s.interrupt();
    s.cue(scenes[n].cue);
  }
  const pace = (s: VoiceSession, i: number) => { s.playbackRate = SPEEDS[i][1]; s.speechRate = (start.speechRate ?? 1) * SPEEDS[i][1]; };
  function pickSpeed(i: number) {
    setSpeed(i);
    try { localStorage.setItem("coachPace", String(i)); } catch {}
    const s = vs.current;
    if (!s) return;
    s.interrupt();
    pace(s, i);
    s.cue(`[Director: from now on speak ${SPEEDS[i][2]}. Say your last line again that way, then carry on.]`);
  }
  /** Meaning in context: one tapped word, or the whole sentence when no word is given. */
  async function translate(sentence: string, word?: string) {
    const src = word || sentence;
    if (!src) return;
    setTr({ src, text: "…" });
    try { setTr({ src, text: (await post("/api/translate", { sentence, word })).tr || "—" }); }
    catch (e) { setTr({ src, text: t(e instanceof Error ? e.message : String(e)) }); }
  }

  function finish() {
    const s = vs.current;
    if (done.current || !s) return;
    done.current = true;
    const r = { sessionId: start.sessionId, turns: s.turns, actualSeconds: s.elapsedMs / 1000, speakingSeconds: s.speakingMs / 1000, provider: s.failovers ? "backup" : "gemini", failovers: s.failovers };
    s.stop();
    onDone(r);
  }

  useEffect(() => {
    const s = (vs.current = new VoiceSession({ onState: (p, st) => setState([p, st]), onTurns: setTurns }));
    const sp = savedSpeed(); // the pace chosen in an earlier call applies from the first word
    setSpeed(sp);
    pace(s, sp);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    s.start(start.sessionId, (start.firstCue ?? CUES.start) + (sp < NORMAL ? ` [Director: for the whole call, speak ${SPEEDS[sp][2]}.]` : "")).then(() => {
      if (!start.firstCue) at(tl.warmupMs, () => s.cue(CUES.main));
      if (!start.firstCue && tl.mistakesAtMs && tl.mistakesAtMs > tl.warmupMs + 20_000) at(tl.mistakesAtMs, () => s.cue(CUES.mistakes));
      at(tl.wrapAtMs, () => s.cue(CUES.wrap));
      at(tl.hardStopMs, finish);
    }).catch((e) => {
      s.stop(); done.current = true;
      const m = e instanceof Error ? e.message : String(e);
      onError(/denied|NotAllowed|Permission/i.test(m) ? t("The microphone is blocked. Allow microphone access for this site, then try again.") : m);
    });
    const tick = setInterval(() => setMs(s.elapsedMs), 500);
    const save = autosave ? setInterval(() => { if (s.turns.length) post("/api/session/turns", { sessionId: start.sessionId, turns: s.turns }).catch(() => {}); }, 20_000) : undefined;
    return () => { timers.forEach(clearTimeout); clearInterval(tick); clearInterval(save); s.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = ms < tl.warmupMs ? "Warm-up" : ms >= tl.wrapAtMs ? "Wrap-up" : tl.mistakesAtMs && ms >= tl.mistakesAtMs ? "Mistake hunt" : "Main activity";
  const left = Math.max(0, tl.wrapAtMs + 25_000 - ms);
  // Live captions: the last two turns, showing the newest words (the tail) as the transcript streams in.
  const cc = turns.slice(-2).map((x) => ({ role: x.role, full: x.text, text: x.text.length > 170 ? `…${x.text.slice(-170)}` : x.text }));
  const label = { connecting: "Connecting…", listening: "Listening to you", speaking: "Coach is talking", thinking: "Thinking…" }[state[1]];

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-between gap-4 overflow-y-auto bg-bg p-6 text-center">
      <div>
        <p className="text-lg font-black">{start.title}</p>
        {start.subtitle && <p className="text-sm text-muted">{start.subtitle}</p>}
        <p className="chip mt-2 inline-block">{start.firstCue ? "" : `${t(phase)} · `}{Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, "0")}</p>
        {scenes[scene] && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <p className="text-sm font-bold">🎬 {scene + 1}/{scenes.length} · {scenes[scene].title}</p>
            <button className="chip !py-1 text-xs" data-on={hints} aria-expanded={hints} onClick={() => setHints(!hints)}>💡 {t("Expressions for this scene")}</button>
            {hints && (
              <ul className="flex max-w-md flex-col gap-1 text-start text-sm">
                {scenes[scene].targets.map((c) => <li key={c.front} className="rounded-xl border border-line bg-card px-3 py-1"><span dir="ltr" className="block font-bold">{c.front}</span><span dir="auto" className="text-xs text-muted">{c.back}</span></li>)}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className={`grad flex shrink-0 items-center justify-center rounded-full ${scenes.length ? "h-24 w-24 text-4xl" : "h-40 w-40 text-6xl"} ${state[1] === "speaking" ? "pulse" : ""}`}>{state[1] === "listening" ? "🎙" : state[1] === "speaking" ? "🗣" : "⏳"}</div>
        <p className="font-bold">{t(label)}</p>
        {state[0] === "backup" && <p className="text-xs text-muted">{t("The main voice service is busy, so the backup voice is in use.")}</p>}
        <div aria-live="polite" className="flex min-h-24 w-full max-w-md flex-col justify-end gap-1 text-start text-sm">
          {cc.map((x, i) => (
            <p key={turns.length - cc.length + i} dir="auto" className={`max-w-[90%] rounded-2xl px-3 py-1.5 ${x.role === "user" ? "grad self-end" : "self-start border border-line bg-card"}`}>
              {x.role === "user" ? x.text : (
                <>
                  {x.text.split(/(\s+)/).map((w, j) => (bare(w) ? <span key={j} role="button" tabIndex={0} className="cursor-pointer rounded underline decoration-dotted underline-offset-4" onClick={() => translate(x.full, bare(w))}>{w}</span> : w))}
                  <button className="ms-2" title={t("Translate the sentence")} aria-label={t("Translate the sentence")} onClick={() => translate(x.full)}>🌐</button>
                </>
              )}
            </p>
          ))}
        </div>
        {tr && (
          <div dir="auto" className="flex w-full max-w-md items-start gap-2 rounded-2xl border border-brand bg-card px-3 py-2 text-start text-sm">
            <p className="flex-1"><span dir="ltr" className="line-clamp-2 text-xs text-muted">{tr.src}</span><span className="font-bold">{tr.text}</span></p>
            <button aria-label={t("Close")} onClick={() => setTr(null)}>✕</button>
          </div>
        )}
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label={t("Coach speed")}>
          <span className="text-xs text-muted">🐢 {t("Coach speed")}</span>
          {SPEEDS.map(([name], i) => <button key={name} className="chip !px-3 !py-1 text-xs" data-on={speed === i} onClick={() => pickSpeed(i)}>{t(name)}</button>)}
        </div>
        {state[1] === "speaking" && <button className="btn ghost" onClick={() => vs.current?.interrupt()}>✋ {t("Let me speak")}</button>}
        {scene + 1 < scenes.length && <button className="btn ghost" onClick={nextScene}>🎬 {t("Next scene")}</button>}
        <button className="btn grad" onClick={finish}>{t("End session")}</button>
      </div>
    </div>
  );
}
