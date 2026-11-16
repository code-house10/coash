"use client";
// Browser voice engine: mic -> Gemini Live -> speaker, with an STT + text + browser-TTS backup.
import { GoogleGenAI, type Session } from "@google/genai";
import type { Turn } from "./shared";

const RATE = 16000, CHUNK = 640; // 40 ms of mic audio per chunk
const WORKLET = `class Mic extends AudioWorkletProcessor{constructor(){super();this.b=[]}process(i){const c=i[0][0];if(c){for(const s of c)this.b.push(s);while(this.b.length>=${CHUNK})this.port.postMessage(new Float32Array(this.b.splice(0,${CHUNK})))}return true}}registerProcessor("mic",Mic)`;

const toInt16 = (f: Float32Array) => Int16Array.from(f, (s) => Math.max(-32768, Math.min(32767, s * 32768)));
const b64 = (a: Int16Array) => { let s = ""; const u = new Uint8Array(a.buffer); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
const rms = (f: Float32Array) => Math.sqrt(f.reduce((a, s) => a + s * s, 0) / f.length);

export function wav(chunks: Int16Array[], rate = RATE) {
  const n = chunks.reduce((a, c) => a + c.length, 0), v = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
  let o = 44; for (const c of chunks) for (const s of c) { v.setInt16(o, s, true); o += 2; }
  return new Blob([v], { type: "audio/wav" });
}

/** Opens the mic and calls onChunk every 40 ms with 16 kHz mono audio. Returns a stop function. */
export async function openMic(onChunk: (f: Float32Array) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext({ sampleRate: RATE });
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
  const node = new AudioWorkletNode(ctx, "mic");
  node.port.onmessage = (e) => onChunk(e.data);
  ctx.createMediaStreamSource(stream).connect(node);
  await ctx.resume();
  return () => { stream.getTracks().forEach((t) => t.stop()); void ctx.close(); };
}

function speak(text: string, rate: number) {
  return new Promise<void>((done) => {
    if (!("speechSynthesis" in window)) return done();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = rate;
    const vs = speechSynthesis.getVoices();
    u.voice = vs.find((v) => v.lang === "en-US" && /natural|google|samantha/i.test(v.name)) ?? vs.find((v) => v.lang.startsWith("en")) ?? null;
    const t = setTimeout(done, Math.max(4000, text.length * 110)); // some browsers never fire onend
    u.onend = u.onerror = () => { clearTimeout(t); done(); };
    speechSynthesis.speak(u);
  });
}

export type VoiceState = "connecting" | "listening" | "speaking" | "thinking";
type Events = { onState: (provider: "gemini" | "backup", state: VoiceState) => void; onTurns: (t: Turn[]) => void };

export class VoiceSession {
  turns: Turn[] = [];
  provider: "gemini" | "backup" = "gemini";
  speakingMs = 0; tutorMs = 0; failovers = 0; speechRate = 1;
  /** Playback speed of the coach's live voice (1 = as generated). Below 1 really slows the audio down.
   * ponytail: plain resampling, so the voice also gets a little deeper (about 2 semitones at 0.88, 4 at 0.8);
   * swap in a pitch-preserving time-stretch (WSOLA) if that ever bothers. */
  playbackRate = 1;
  /** Where the token comes from; placement and stage tests reuse the same endpoint. */
  private sessionId = 0;
  private startedAt = 0; private stopped = false;
  private live?: Session; private handle?: string; private stopMic?: () => void;
  private out?: AudioContext; private playAt = 0; private sources = new Set<AudioBufferSourceNode>();
  private open: Turn["role"] | null = null;
  // backup mode
  private segment: Int16Array[] = []; private silence = 0; private busy = false; private pending: string[] = [];

  constructor(private ev: Events) {}
  get elapsedMs() { return this.startedAt ? Date.now() - this.startedAt : 0; }
  private get coachTalking() { return !!this.out && this.playAt > this.out.currentTime + 0.05; }

  async start(sessionId: number, firstCue: string) {
    this.sessionId = sessionId;
    this.out = new AudioContext({ sampleRate: 24000 });
    await this.out.resume();
    this.stopMic = await openMic((f) => this.onMic(f)); // throws NotAllowedError if the mic is blocked
    if (this.stopped) return this.stopMic(); // unmounted while the mic prompt was open
    this.startedAt = Date.now();
    this.ev.onState("gemini", "connecting");
    try { await this.connect(); } catch (e) { this.failover(`connect: ${e}`); }
    if (this.stopped) return this.stop();
    this.cue(firstCue);
  }

  private async connect() {
    const r = await fetch("/api/live-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: this.sessionId, handle: this.handle }) });
    const t = await r.json();
    if (!r.ok) throw new Error(t.error ?? `token HTTP ${r.status}`);
    const ai = new GoogleGenAI({ apiKey: t.token, httpOptions: { apiVersion: "v1alpha" } });
    const mine = (this.live = await ai.live.connect({
      model: t.model, config: t.config,
      callbacks: {
        onmessage: (m) => this.onGemini(m),
        onerror: (e) => console.warn("gemini error", e.message),
        onclose: () => { if (!this.stopped && this.live === mine && this.provider === "gemini") void this.reconnect("closed"); },
      },
    }));
    this.ev.onState("gemini", "listening");
  }

  private async reconnect(why: string) {
    this.live = undefined;
    try { await this.connect(); } catch (e) { this.failover(`${why}: ${e}`); }
  }

  private failover(reason: string) {
    if (this.provider === "backup") return;
    this.provider = "backup"; this.failovers++;
    try { this.live?.close(); } catch {}
    this.live = undefined;
    this.flush();
    this.ev.onState("backup", "listening");
    void fetch("/api/provider-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "gemini", type: "failover", reason: String(reason).slice(0, 300) }) }).catch(() => {});
    if (this.pending.length) void this.backupReply();
  }

  private onGemini(m: any) {
    const up = m.sessionResumptionUpdate;
    if (up?.resumable && up.newHandle) this.handle = up.newHandle;
    if (m.goAway) void this.reconnect("goAway"); // server is about to drop the socket; resume on a new one
    const c = m.serverContent;
    if (!c) return;
    if (c.interrupted) this.flush();
    for (const p of c.modelTurn?.parts ?? []) if (p.inlineData?.data) this.play(p.inlineData.data);
    if (c.inputTranscription?.text) this.append("user", c.inputTranscription.text);
    if (c.outputTranscription?.text) this.append("model", c.outputTranscription.text);
    if (c.turnComplete) this.open = null;
  }

  private play(data: string) {
    const out = this.out!;
    const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    const buf = out.createBuffer(1, pcm.length, 24000);
    buf.getChannelData(0).set(Float32Array.from(pcm, (s) => s / 32768));
    const src = out.createBufferSource();
    src.buffer = buf; src.playbackRate.value = this.playbackRate; src.connect(out.destination);
    this.playAt = Math.max(this.playAt, out.currentTime + 0.03);
    src.start(this.playAt);
    const secs = buf.duration / this.playbackRate;
    this.playAt += secs; this.tutorMs += secs * 1000;
    this.sources.add(src);
    src.onended = () => { this.sources.delete(src); if (!this.sources.size && !this.stopped) this.ev.onState(this.provider, "listening"); };
    this.ev.onState("gemini", "speaking");
  }

  private flush() {
    this.sources.forEach((s) => { try { s.stop(); } catch {} });
    this.sources.clear(); this.playAt = 0;
  }

  private onMic(f: Float32Array) {
    if (this.stopped) return;
    const loud = rms(f) > 0.02;
    // ponytail: echo is left to the browser's echoCancellation; add a half-duplex gate if speakers bleed on some phones.
    if (loud && !this.coachTalking && !this.busy) this.speakingMs += 40;
    const pcm = toInt16(f);
    if (this.provider === "gemini") {
      try { this.live?.sendRealtimeInput({ audio: { data: b64(pcm), mimeType: `audio/pcm;rate=${RATE}` } }); } catch {}
      return;
    }
    if (this.busy) return;
    // Backup mode: cut a turn after 800 ms of silence, if it holds at least 1.3 s of audio.
    if (loud) { this.segment.push(pcm); this.silence = 0; }
    else if (this.segment.length) {
      this.segment.push(pcm); this.silence += 40;
      if (this.silence >= 800) { const seg = this.segment; this.segment = []; this.silence = 0; if (seg.length * 40 >= 1300) void this.backupTurn(seg); }
    }
  }

  private async backupTurn(seg: Int16Array[]) {
    this.busy = true; this.ev.onState("backup", "thinking");
    try {
      const f = new FormData(); f.append("file", wav(seg), "turn.wav");
      const r = await fetch("/api/stt", { method: "POST", body: f });
      const { text } = await r.json();
      if (text) { this.append("user", text, true); await this.backupReply(); }
    } catch (e) { console.warn("backup turn failed", e); }
    this.busy = false;
    if (!this.stopped) this.ev.onState("backup", "listening");
  }

  private async backupReply() {
    this.busy = true; this.ev.onState("backup", "thinking");
    try {
      const cues = this.pending.splice(0).map((text) => ({ role: "user" as const, text }));
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: this.sessionId, turns: [...this.turns, ...cues] }) });
      const { text } = await r.json();
      if (text && !this.stopped) {
        this.append("model", text, true); this.ev.onState("backup", "speaking");
        const t = Date.now(); await speak(text, this.speechRate); this.tutorMs += Date.now() - t;
      }
    } catch (e) { console.warn("backup reply failed", e); }
    this.busy = false; this.segment = [];
    if (!this.stopped) this.ev.onState("backup", "listening");
  }

  private append(role: Turn["role"], text: string, whole = false) {
    const last = this.turns[this.turns.length - 1];
    if (!whole && last && last.role === role && this.open === role) last.text += text;
    else this.turns.push({ role, text });
    this.open = whole ? null : role;
    this.ev.onTurns(this.turns.map((t) => ({ ...t })));
  }

  /** Send a hidden stage direction to the coach. */
  cue(text: string) {
    if (this.stopped) return;
    if (this.provider === "gemini" && this.live) { try { this.live.sendRealtimeInput({ text }); return; } catch {} }
    this.pending.push(text);
    if (this.provider === "backup" && !this.busy) void this.backupReply();
  }

  /** Cut the coach off mid-sentence. */
  interrupt() { this.flush(); if ("speechSynthesis" in window) speechSynthesis.cancel(); }

  stop() {
    this.stopped = true;
    this.interrupt(); this.stopMic?.();
    try { this.live?.close(); } catch {}
    if (this.out?.state !== "closed") void this.out?.close().catch(() => {});
  }
}
