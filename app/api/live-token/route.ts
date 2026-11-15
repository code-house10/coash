import { api, Bad } from "@/lib/auth";
import { get } from "@/lib/db";
import { liveToken } from "@/lib/ai";
import { coachPrompt } from "@/lib/game";

export const POST = api(async (u, req) => {
  const { sessionId, handle } = await req.json();
  const s = get("SELECT * FROM sessions WHERE id=? AND user_id=? AND status='open'", Number(sessionId), u.id);
  if (!s) throw new Bad("Session not found.");
  return liveToken(coachPrompt(u, s), u.voice, handle || undefined);
});
