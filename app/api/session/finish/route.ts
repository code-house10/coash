import { api, Bad } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { finishSession } from "@/lib/game";
import type { Turn } from "@/lib/shared";

export const POST = api(async (u, req) => {
  const b = await req.json();
  const s = await get("SELECT * FROM sessions WHERE id=? AND user_id=? AND status='open'", Number(b.sessionId), u.id);
  if (!s) throw new Bad("Session not found.");
  const turns: Turn[] = (b.turns ?? []).filter((t: Turn) => t?.text?.trim());
  // Never trust the client clock for billing minutes: cap at planned length plus grace.
  const seconds = Math.min(Number(b.actualSeconds) || 0, s.minutes * 60 + 30);
  const speaking = Math.min(Number(b.speakingSeconds) || 0, seconds);
  if (seconds < 45 || turns.filter((t) => t.role === "user").length < 2) {
    await run("UPDATE sessions SET status='short', seconds=?, turns=? WHERE id=?", seconds, JSON.stringify(turns), s.id);
    return { status: "too_short" };
  }
  await run("UPDATE sessions SET seconds=?, turns=? WHERE id=?", seconds, JSON.stringify(turns), s.id); // keep it even if grading fails
  const r = await finishSession(u, s, turns, seconds, speaking, b.provider === "backup" ? "backup" : "gemini");
  return { status: "done", ...r };
});
