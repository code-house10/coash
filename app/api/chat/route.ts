import { api, Bad } from "@/lib/auth";
import { get } from "@/lib/db";
import { chat } from "@/lib/ai";
import { coachPrompt } from "@/lib/game";
export const POST = api(async (u, req) => {
  const { sessionId, turns } = await req.json();
  const s = await get("SELECT * FROM sessions WHERE id=? AND user_id=? AND status='open'", Number(sessionId), u.id);
  if (!s) throw new Bad("Session not found.");
  return { text: await chat(await coachPrompt(u, s), (turns ?? []).slice(-30)) };
});
