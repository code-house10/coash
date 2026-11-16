"use client";
import { useEffect, useRef, useState } from "react";
import { useT, post } from "@/lib/i18n";
import { openMic, wav } from "@/lib/voice";
import { Call, type CallStart, type CallResult } from "@/components/Call";

const LIVE_CUE = "[Director: the learner just joined. Say hello in three words and start the first situation right away.]";

type Item = { cardId: number; scene: string; line: string };
type Saved = { id: number; scene: string; line: string; said: string; fixed: string; native: string; tip: string; ok: number; front: string | null };

// Read-aloud in the coach's Gemini voice. Clips are kept for the page's lifetime so a replay is instant;
// if Gemini is busy the browser's own voice is used instead.
const clips = new Map<string, string>();
let playing: HTMLAudioElement | undefined;
async function say(text: string) {
  playing?.pause(); speechSynthesis.cancel();
  try {
    let url = clips.get(text);
    if (!url) {
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error(`tts ${r.status}`);
      clips.set(text, (url = URL.createObjectURL(await r.blob())));
    }
    playing = new Audio(url);
    await playing.play();
  } catch { const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; speechSynthesis.speak(u); }
}
function Speak({ text }: { text: string }) {
  const [busy, setBusy] = useState(false);
  return <button className="ms-1" aria-label="Listen" disabled={busy} onClick={async () => { setBusy(true); await say(text); setBusy(false); }}>{busy ? "⏳" : "🔊"}</button>;
}

/** The two corrected versions of a reply: the learner's own words fixed, and the native wording. */
function Answer({ r, t }: { r: Saved; t: ReturnType<typeof useT> }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p dir="auto" className="text-muted">{t("You said")}: {r.said}</p>
      <div dir="ltr" className="rounded-xl bg-bg p-2"><p className="text-xs font-black text-brand">{r.ok ? "✅ " : "✏️ "}{t("Your reply, fixed")}</p><p className="font-bold">{r.fixed}<Speak text={r.fixed} /></p></div>
      <div dir="ltr" className="rounded-xl bg-bg p-2"><p className="text-xs font-black text-brand">🗣 {t("A native speaker would say")}</p><p className="font-bold">{r.native}<Speak text={r.native} /></p></div>
      {r.tip && <p dir="auto" className="text-muted">💡 {r.tip}</p>}
      {r.front && <p dir="ltr" className="text-xs text-muted">🃏 {r.front}</p>}
    </div>
  );
}

/** Everyday situations built from the learner's own flashcards. Replies may mix Arabic into the English. */
export function Situations() {
  const t = useT();
  const [tab, setTab] = useState<"practice" | "saved">("practice");
  const [cards, setCards] = useState<number | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [queue, setQueue] = useState<Item[]>([]);
  const [said, setSaid] = useState("");
  const [result, setResult] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const item = queue[0];

  const call = async (body: object) => {
    setBusy(true); setNote("");
    try { return await post("/api/situations", body); }
    catch (e) { setNote(t(e instanceof Error ? e.message : String(e))); return null; }
    finally { setBusy(false); }
  };
  // The next batch is fetched in the background (on page load, and while the last situation of a batch is
  // being answered), so "next situation" does not wait for the AI.
  const more = useRef<Promise<Item[]> | null>(null);
  const preload = () => {
    if (more.current) return;
    const p = (more.current = post("/api/situations", { action: "next" }).then((r) => r.items as Item[]));
    p.catch(() => { if (more.current === p) more.current = null; });
  };
  useEffect(() => { void post("/api/situations", { action: "list" }).then((r) => { setCards(r.cards); setSaved(r.saved); if (r.cards) preload(); }).catch((e) => setNote(String(e.message ?? e))); }, []);

  async function upload(file?: File) {
    if (!file) return;
    const r = await call({ action: "import", csv: await file.text() });
    if (r) { setCards(r.cards); setNote(t("{n} new cards added.", { n: r.added })); }
  }
  async function next() {
    setResult(null); setSaid("");
    if (queue.length > 1) { if (queue.length === 2) preload(); return setQueue(queue.slice(1)); }
    setBusy(true); setNote("");
    preload();
    try { const items = await more.current!; more.current = null; setQueue(items); }
    catch (e) { setQueue([]); setNote(t(e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  }
  async function check() {
    const r = await call({ action: "check", ...item, said });
    if (r) { setResult(r); setSaved((s) => [r, ...s]); }
  }
  // Voice reply: tap to record (60 s cap), tap again to stop; the transcript lands in the box to edit before checking.
  const [rec, setRec] = useState(false);
  const stopRec = useRef(() => {});
  useEffect(() => () => stopRec.current(), []);
  async function record() {
    if (rec) return stopRec.current();
    setNote("");
    const chunks: Int16Array[] = [];
    try {
      const stop = await openMic((f) => chunks.push(Int16Array.from(f, (s) => Math.max(-32768, Math.min(32767, s * 32768)))));
      const cap = setTimeout(() => stopRec.current(), 60_000);
      setRec(true);
      stopRec.current = async () => {
        clearTimeout(cap); stop(); setRec(false); stopRec.current = () => {};
        if (chunks.length < 12) return; // under half a second: a mis-tap
        setBusy(true);
        try {
          const f = new FormData(); f.append("file", wav(chunks), "reply.wav"); f.append("mixed", "1");
          const r = await fetch("/api/stt", { method: "POST", body: f }), j = await r.json();
          if (!r.ok) throw new Error(j.error);
          setSaid((s) => `${s} ${j.text ?? ""}`.trim());
        } catch (e) { setNote(t(e instanceof Error ? e.message : String(e))); }
        setBusy(false);
      };
    } catch { setNote(t("The microphone is blocked. Allow microphone access for this site, then try again.")); }
  }
  // Live mode: the coach voices each situation and corrects out loud; the replies are saved when the call ends.
  const [live, setLive] = useState<CallStart | null>(null);
  async function goLive() {
    const r = await call({ action: "live" });
    if (r) { stopRec.current(); speechSynthesis.cancel(); setLive({ ...r, title: t("Situations"), subtitle: t("Reply out loud. Stuck on a word? Say it in Arabic."), firstCue: LIVE_CUE }); }
  }
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState<CallResult | null>(null); // a finished call whose replies could not be saved yet
  async function liveDone(res: CallResult) {
    setLive(null); setUnsaved(null); setSaving(true);
    const r = await call({ action: "live-finish", sessionId: res.sessionId, turns: res.turns, seconds: res.actualSeconds });
    setSaving(false);
    if (!r) return setUnsaved(res);
    setSaved((s) => [...[...r.saved].reverse(), ...s]);
    setNote(t("{n} replies saved for review.", { n: r.saved.length }));
    if (r.saved.length) setTab("saved");
  }
  async function remove(id: number) { if (await call({ action: "delete", id })) setSaved((s) => s.filter((x) => x.id !== id)); }

  const uploader = (
    <label className="btn ghost cursor-pointer text-center text-sm">📥 {t("Upload cards (CSV)")}
      <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );

  if (live) return <Call start={live} onDone={liveDone} onError={(m) => { setLive(null); setNote(m); }} />;

  return (
    <>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-black">{t("Situations")}</h1>{cards !== null && <span className="chip">🃏 {cards}</span>}</div>
      <div className="flex gap-2">
        <button className="chip" data-on={tab === "practice"} onClick={() => setTab("practice")}>{t("Practice")}</button>
        <button className="chip" data-on={tab === "saved"} onClick={() => setTab("saved")}>{t("My saved replies")} · {saved.length}</button>
      </div>
      {note && <p role="status" className="rounded-xl border border-accent p-2 text-sm font-bold text-accent">{note}</p>}

      {saving && <p className="text-sm text-muted">⏳ {t("Saving your replies…")}</p>}
      {unsaved && <button className="btn grad" disabled={busy} onClick={() => liveDone(unsaved)}>{t("Try saving my replies again")}</button>}

      {tab === "practice" && cards === 0 && (
        <div className="card flex flex-col gap-3"><p>{t("Upload your Duo Cards export and every card becomes a real-life situation to answer.")}</p>{uploader}</div>
      )}
      {tab === "practice" && !!cards && !item && (
        <div className="card flex flex-col gap-3">
          <p className="text-muted">{t("Answer the way you would in real life. Stuck on a word? Write it in Arabic and keep going.")}</p>
          <button className="btn grad" disabled={busy} onClick={goLive}>🎙 {t("Live conversation")}</button>
          <button className="btn ghost" disabled={busy} onClick={next}>{busy ? t("Thinking…") : `⌨️ ${t("Type my replies")}`}</button>
          {uploader}
        </div>
      )}
      {tab === "practice" && item && (
        <div className="card flex flex-col gap-3">
          <p dir="auto">{item.scene}</p>
          <p dir="ltr" className="card self-start !p-3 text-sm font-bold">{item.line}<Speak text={item.line} /></p>
          {result ? <Answer r={result} t={t} /> : (
            <textarea dir="auto" rows={2} className="input" maxLength={500} placeholder={t("Your reply: English, or mix in Arabic")} value={said} onChange={(e) => setSaid(e.target.value)} />
          )}
          {result
            ? <button className="btn grad" disabled={busy} onClick={next}>{busy ? t("Thinking…") : t("Next situation")}</button>
            : <div className="flex gap-2"><button className="btn ghost" disabled={busy || rec} onClick={next}>{t("Skip")}</button><button className={`btn ghost !px-3 ${rec ? "pulse" : ""}`} title={t("Reply by voice")} aria-label={t("Reply by voice")} disabled={busy} onClick={record}>{rec ? "⏹" : "🎙"}</button><button className="btn grad flex-1" disabled={busy || rec || !said.trim()} onClick={check}>{busy ? t("Thinking…") : t("Check my reply")}</button></div>}
        </div>
      )}

      {tab === "saved" && !saved.length && <p className="text-center text-muted">{t("Nothing saved yet. Every reply you check is kept here.")}</p>}
      {tab === "saved" && saved.map((r) => (
        <details key={r.id} className="card">
          <summary className="cursor-pointer"><span dir="auto">{r.scene}</span><span dir="ltr" className="mt-1 block text-sm font-bold">“{r.line}”</span><span className="text-xs text-muted">{t("Say your answer, then tap to check.")}</span></summary>
          <div className="mt-3"><Answer r={r} t={t} /><button className="mt-2 text-xs underline text-muted" onClick={() => remove(r.id)}>{t("Delete")}</button></div>
        </details>
      ))}
    </>
  );
}
