"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT, post } from "@/lib/i18n";

type Msg = { id: number; name: string; text: string | null; voice: number; seconds: number; created: string; mine: boolean };

/** Level chat room: text and voice notes, English only, polled every 4 seconds. */
export function Community() {
  const t = useT();
  const [room, setRoom] = useState("");
  const [rulesOk, setRulesOk] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [polish, setPolish] = useState<{ better: string; tip: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const last = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  const merge = useCallback((r: any) => {
    if (r.room) setRoom(r.room);
    if (r.rulesOk !== undefined) setRulesOk(r.rulesOk);
    if (r.sent?.xp) setNote(t("+{n} XP for showing up today", { n: r.sent.xp }));
    if (!r.messages?.length) return;
    last.current = r.messages[r.messages.length - 1].id;
    setMsgs((old) => [...old, ...r.messages.filter((m: Msg) => !old.some((o) => o.id === m.id))]);
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [t]);
  const call = useCallback(async (body: object) => {
    try { merge(await post("/api/community", { ...body, after: last.current })); return true; }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); return false; }
  }, [merge]);

  useEffect(() => {
    void call({ action: "list" });
    const i = setInterval(() => { if (document.visibilityState === "visible") void call({ action: "list" }); }, 4000);
    return () => clearInterval(i);
  }, [call]);

  async function send(body = text) {
    if (!body.trim() || busy) return;
    setBusy(true); setNote(""); setPolish(null);
    if (await call({ action: "send", text: body })) setText("");
    setBusy(false);
  }
  async function improve() {
    setBusy(true); setNote("");
    try { const r = await post("/api/community", { action: "polish", text }); setPolish({ better: r.better ?? text, tip: r.tip ?? "" }); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  async function record() {
    if (rec) return rec.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
      const parts: Blob[] = [], t0 = Date.now();
      const cap = setTimeout(() => r.stop(), 60_000);
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = async () => {
        clearTimeout(cap); stream.getTracks().forEach((x) => x.stop()); setRec(null);
        const seconds = (Date.now() - t0) / 1000;
        if (seconds < 1) return;
        const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
        let s = ""; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
        setBusy(true); await call({ action: "voice", audio: btoa(s), mime: r.mimeType, seconds }); setBusy(false);
      };
      r.start(); setRec(r);
    } catch { setNote(t("The microphone is blocked. Allow microphone access for this site, then try again.")); }
  }
  async function remove(id: number) { if (await call({ action: "delete", id })) setMsgs((m) => m.filter((x) => x.id !== id)); }

  if (!rulesOk)
    return (
      <div className="card flex flex-col gap-3">
        <h1 className="text-xl font-black">{t("Before you join")}</h1>
        <ul className="list-disc space-y-1 ps-5 text-sm"><li>{t("English only. Mistakes are welcome.")}</li><li>{t("Be kind. Help, do not mock.")}</li><li>{t("No private details, links or selling.")}</li></ul>
        <button className="btn grad" onClick={async () => { await post("/api/community", { action: "accept-rules" }); setRulesOk(true); }}>{t("I agree")}</button>
      </div>
    );

  return (
    <>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-black">{room} {t("community")}</h1><span className="chip">EN only</span></div>
      <div className="flex min-h-[50dvh] flex-col gap-2">
        {!msgs.length && <p className="text-center text-muted">{t("Nobody has written yet. Say hello!")}</p>}
        {msgs.map((m) => (
          <div key={m.id} dir="ltr" className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "grad self-end" : "card self-start !p-3"}`}>
            {!m.mine && <p className="text-xs font-black text-brand">{m.name}</p>}
            {m.voice ? <audio controls preload="none" src={`/api/community/audio/${m.id}`} className="h-9 max-w-56" /> : <p className="whitespace-pre-wrap break-words">{m.text}</p>}
            {m.mine && <button className="text-[11px] underline opacity-80" onClick={() => remove(m.id)}>{t("Delete")}</button>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="sticky bottom-20 flex flex-col gap-2 rounded-3xl border border-line bg-card p-3">
        {polish && (
          <div dir="ltr" className="rounded-xl bg-bg p-2 text-sm"><p className="font-bold">✨ {polish.better}</p><p className="text-muted" dir="auto">{polish.tip}</p>
            <button className="font-bold text-brand" onClick={() => send(polish.better)}>{t("Send this version")}</button></div>
        )}
        {note && <p className="text-xs text-muted">{note}</p>}
        <div className="flex gap-2">
          <input dir="ltr" className="input" maxLength={500} placeholder="Write in English…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button className="btn ghost !px-3" title={t("Polish my English")} disabled={busy || !text.trim()} onClick={improve}>✨</button>
          <button className={`btn ghost !px-3 ${rec ? "pulse" : ""}`} title={t("Voice note")} disabled={busy} onClick={record}>{rec ? "⏹" : "🎙"}</button>
          <button className="btn grad !px-4" disabled={busy || !text.trim()} onClick={() => send()}>➤</button>
        </div>
      </div>
    </>
  );
}
