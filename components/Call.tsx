"use client";
import { useEffect, useRef, useState } from "react";
import { useT, post } from "@/lib/i18n";
import { VoiceSession, type VoiceState } from "@/lib/voice";
import { CUES, type Turn } from "@/lib/shared";

export type CallStart = {
  sessionId: number; speechRate?: number; title: string; subtitle?: string;
  /** Opening stage direction. When set, the call is a free-form drill: no warm-up/main/mistake-hunt phases. */
  firstCue?: string;
  timeline: { warmupMs: number; mistakesAtMs?: number | null; wrapAtMs: number; hardStopMs: number };
};
export type CallResult = { sessionId: number; turns: Turn[]; actualSeconds: number; speakingSeconds: number; provider: string; failovers: number };

/** Full-screen voice call. Runs the session clock, sends stage cues, and reports the result once. */
export function Call({ start, autosave, onDone, onError }: { start: CallStart; autosave?: boolean; onDone: (r: CallResult) => void; onError: (m: string) => void }) {
  const t = useT();
  const vs = useRef<VoiceSession | null>(null);
  const done = useRef(false);
  const [state, setState] = useState<[string, VoiceState]>(["gemini", "connecting"]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ms, setMs] = useState(0);
  const { timeline: tl } = start;

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
    s.speechRate = start.speechRate ?? 1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    s.start(start.sessionId, start.firstCue ?? CUES.start).then(() => {
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
  const cc = turns.slice(-2).map((x) => ({ role: x.role, text: x.text.length > 170 ? `…${x.text.slice(-170)}` : x.text }));
  const label = { connecting: "Connecting…", listening: "Listening to you", speaking: "Coach is talking", thinking: "Thinking…" }[state[1]];

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-between gap-4 bg-bg p-6 text-center">
      <div>
        <p className="text-lg font-black">{start.title}</p>
        {start.subtitle && <p className="text-sm text-muted">{start.subtitle}</p>}
        <p className="chip mt-2 inline-block">{start.firstCue ? "" : `${t(phase)} · `}{Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, "0")}</p>
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className={`grad flex h-40 w-40 items-center justify-center rounded-full text-6xl ${state[1] === "speaking" ? "pulse" : ""}`}>{state[1] === "listening" ? "🎙" : state[1] === "speaking" ? "🗣" : "⏳"}</div>
        <p className="font-bold">{t(label)}</p>
        {state[0] === "backup" && <p className="text-xs text-muted">{t("The main voice service is busy, so the backup voice is in use.")}</p>}
        <div aria-live="polite" className="flex min-h-24 w-full max-w-md flex-col justify-end gap-1 text-start text-sm">
          {cc.map((x, i) => (
            <p key={turns.length - cc.length + i} dir="auto" className={`max-w-[90%] rounded-2xl px-3 py-1.5 ${x.role === "user" ? "grad self-end" : "self-start border border-line bg-card"}`}>{x.text}</p>
          ))}
        </div>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2">
        {state[1] === "speaking" && <button className="btn ghost" onClick={() => vs.current?.interrupt()}>✋ {t("Let me speak")}</button>}
        <button className="btn grad" onClick={finish}>{t("End session")}</button>
      </div>
    </div>
  );
}
