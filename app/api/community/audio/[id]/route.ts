import { api } from "@/lib/auth";
import { get } from "@/lib/db";
import { roomOf } from "@/lib/shared";

export const GET = api(async (u, _req, ctx) => {
  const m = get("SELECT audio, mime FROM messages WHERE id=? AND room=? AND audio IS NOT NULL", Number((await ctx.params).id), roomOf(u.level ?? "A1"));
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(m.audio, { headers: { "Content-Type": m.mime, "Cache-Control": "private, max-age=86400" } });
});
