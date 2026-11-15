import { get, run } from "@/lib/db";
import { hash, verify, signIn } from "@/lib/auth";

// ponytail: in-memory limiter, per process. Move to the DB if you run several instances.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), a = (hits.get(ip) ?? []).filter((t) => now - t < 5 * 60_000);
  a.push(now); hits.set(ip, a);
  return a.length > 15;
}
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  // Surface setup problems (missing database config, wrong token) instead of a bare 500.
  try { return await handle(req); }
  catch (e) { console.error("/api/auth", e); return bad(e instanceof Error ? e.message : String(e), 500); }
}

async function handle(req: Request) {
  const b = await req.json().catch(() => ({}));
  const hasAccount = !!await get("SELECT 1 FROM users LIMIT 1");
  if (b.action === "status") return Response.json({ hasAccount });
  if (limited(req.headers.get("x-forwarded-for") ?? "local")) return bad("Too many attempts. Wait a few minutes.", 429);

  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const code = String(b.setupCode ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad("Enter a valid email.");

  if (b.action === "signin") {
    const u = await get("SELECT id, pass FROM users WHERE email=?", email);
    if (!u || !verify(password, u.pass)) return bad("Wrong email or password.");
    await signIn(u.id);
    return Response.json({ ok: true });
  }
  if (password.length < 8) return bad("Use a password of at least 8 characters.");

  if (b.action === "signup") {
    if (await get("SELECT 1 FROM users WHERE email=?", email)) return bad("An account with this email already exists. Sign in instead.");
    if (!hasAccount) {
      if (!process.env.SETUP_CODE || code !== process.env.SETUP_CODE) return bad("This setup code is not valid.");
    } else if (!(await run("UPDATE codes SET used=1 WHERE code=? AND kind='invite' AND used=0", code)).changes)
      return bad("This invite code is not valid, or it has already been used.");
    const until = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const id = Number((await run("INSERT INTO users (email, pass, is_admin, access_until) VALUES (?,?,?,?)", email, hash(password), hasAccount ? 0 : 1, until)).lastInsertRowid);
    await signIn(id);
    return Response.json({ ok: true });
  }
  if (b.action === "reset") {
    if (!(await run("UPDATE codes SET used=1 WHERE code=? AND kind='reset' AND email=? AND used=0", code, email)).changes)
      return bad("This reset code is not valid, or it has already been used.");
    const u = await get("SELECT id FROM users WHERE email=?", email)!;
    await run("UPDATE users SET pass=? WHERE id=?", hash(password), u.id);
    await run("DELETE FROM tokens WHERE user_id=?", u.id);
    await signIn(u.id);
    return Response.json({ ok: true });
  }
  return bad("Unknown action.");
}
