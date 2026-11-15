import { currentUser } from "@/lib/auth";
import { run } from "@/lib/db";
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const u = await currentUser();
  await run("INSERT INTO events (user_id, provider, type, reason) VALUES (?,?,?,?)", u?.id ?? null, String(b.provider ?? "").slice(0, 40), String(b.type ?? "").slice(0, 40), String(b.reason ?? "").slice(0, 500));
  return Response.json({ ok: true });
}
