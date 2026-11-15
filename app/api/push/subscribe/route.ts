import { api, Bad } from "@/lib/auth";
import { run } from "@/lib/db";

export const POST = api(async (u, req) => {
  const { subscription: s } = await req.json();
  if (!s?.endpoint?.startsWith("https://")) throw new Bad("Bad subscription.");
  await run("INSERT OR REPLACE INTO pushes (endpoint, user_id, sub) VALUES (?,?,?)", s.endpoint, u.id, JSON.stringify(s));
  return { ok: true };
});
export const DELETE = api(async (u, req) => {
  const { endpoint } = await req.json();
  await run("DELETE FROM pushes WHERE endpoint=? AND user_id=?", String(endpoint), u.id);
  return { ok: true };
});
