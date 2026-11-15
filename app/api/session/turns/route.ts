import { api } from "@/lib/auth";
import { run } from "@/lib/db";
export const POST = api(async (u, req) => {
  const { sessionId, turns } = await req.json();
  run("UPDATE sessions SET turns=? WHERE id=? AND user_id=? AND status='open'", JSON.stringify(turns ?? []), Number(sessionId), u.id);
  return { ok: true };
});
