import { GoogleGenAI, Modality } from "@google/genai";
import type { Turn } from "./shared";

export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-flash-latest";
export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set. Add it to .env.local and restart.");
  return k;
}
// No SDK retries and a hard timeout: a busy model fails fast and gen() moves to the next one.
const ai = () => new GoogleGenAI({ apiKey: key(), httpOptions: { apiVersion: "v1beta", timeout: 25_000, retryOptions: { attempts: 1 } } });
const TEXT_MODELS = [...new Set([TEXT_MODEL, "gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-lite-latest"])];

const down = new Map<string, number>();
type Gen = Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">;
/** generateContent with model fallback, because free-tier models are often "experiencing high demand" (503). */
async function gen(req: Gen): Promise<string> {
  let last: unknown;
  // A model that just failed is skipped for 5 minutes, so one busy model does not slow every request.
  const up = TEXT_MODELS.filter((m) => (down.get(m) ?? 0) < Date.now());
  for (const model of up.length ? up : TEXT_MODELS) {
    try { return (await ai().models.generateContent({ ...req, model })).text ?? ""; }
    catch (e) { last = e; down.set(model, Date.now() + 5 * 60_000); console.warn(`gemini ${model} failed:`, String((e as Error)?.message ?? e).slice(0, 160)); }
  }
  throw new Error("The AI service is busy right now. Please try again in a minute.", { cause: last });
}

/** Ask the text model for a JSON object. */
export async function json<T = any>(prompt: string, system?: string): Promise<T> {
  const text = await gen({ contents: prompt, config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.4 } });
  return JSON.parse(text || "{}");
}

const groq = (path: string, init: RequestInit) =>
  fetch(`https://api.groq.com/openai/v1/${path}`, {
    ...init, headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, ...init.headers },
  }).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`groq ${r.status}: ${await r.text()}`))));

/** Backup text reply for when the live voice service is down. Groq if configured, else Gemini text. */
export async function chat(system: string, turns: Turn[]): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    const r = await groq("chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile", max_tokens: 200,
        messages: [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role === "model" ? "assistant" : "user", content: t.text }))],
      }),
    });
    return r.choices?.[0]?.message?.content ?? "";
  }
  return gen({ config: { systemInstruction: system }, contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })) });
}

/** Speech to text. Groq Whisper if configured, else Gemini audio understanding. */
export async function stt(file: File, mixed = false): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    const f = new FormData();
    f.append("file", file, file.name || "audio.wav");
    f.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
    // mixed: the speaker switches between English and Arabic, so let Whisper detect instead of forcing English.
    if (mixed) f.append("prompt", "English mixed with Arabic. يعني I mean, مش عارف how to say it.");
    else f.append("language", "en");
    return (await groq("audio/transcriptions", { method: "POST", body: f })).text ?? "";
  }
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  return (await gen({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: file.type || "audio/wav", data } }, { text: `Transcribe this speech exactly as spoken, mistakes included.${mixed ? " The speaker mixes English and Arabic: write English words in Latin letters and Arabic words in Arabic script, and do not translate." : ""} Output only the transcript.` }] }] })).trim();
}

/** Mint a single-use token the browser uses to open the live voice socket. The API key never leaves the server. */
export async function liveToken(system: string, voice: string, handle?: string) {
  const config = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: system,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: handle ? { handle } : {},
  };
  const client = new GoogleGenAI({ apiKey: key(), httpOptions: { apiVersion: "v1alpha" } });
  const t = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 2 * 60_000).toISOString(),
      httpOptions: { apiVersion: "v1alpha" },
    },
  });
  return { token: t.name, model: LIVE_MODEL, config };
}
