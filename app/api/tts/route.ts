import { api, Bad } from "@/lib/auth";
import { tts } from "@/lib/ai";
/** Reads a short English text aloud in the user's coach voice. */
export const POST = api(async (u, req) => {
  const text = String((await req.json()).text ?? "").trim().slice(0, 600);
  if (!text) throw new Bad("Nothing to read.");
  return new Response(new Uint8Array(await tts(text, u.voice || "Kore")), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });
});
