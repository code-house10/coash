import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { get, run, J } from "./db";

export type User = {
  id: number; email: string; is_admin: number; name: string; profile: Record<string, string>;
  theme: { mode: string; brand: string; accent: string }; voice: string; ui_lang: string; report_lang: string;
  minutes_pref: number; reminder: string; timezone: string; plan: string; access_until: string | null;
  level: string | null; xp: number; streak: number; freezes: number; last_day: string | null; rules_ok: number;
};

const COOKIE = "sid";

export function hash(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}
export function verify(pw: string, stored: string) {
  const [salt, h] = stored.split(":");
  const a = scryptSync(pw, salt, 32), b = Buffer.from(h, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function signIn(userId: number) {
  const token = randomBytes(32).toString("hex");
  run("INSERT INTO tokens (token, user_id) VALUES (?, ?)", token, userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
}
export async function signOut() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) run("DELETE FROM tokens WHERE token = ?", token);
  c.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const r = get("SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?", token);
  if (!r) return null;
  return { ...r, profile: J(r.profile, {}), theme: J(r.theme, { mode: "auto", brand: "#7c4dff", accent: "#ec4899" }) };
}

/** For pages: redirects to /login, and to /placement until the user has a level. */
export async function pageUser(needLevel = true) {
  const u = await currentUser();
  // DEV_AUTO_LOGIN=1 (never in production) skips the sign-in page for local testing.
  if (!u) redirect(process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_LOGIN === "1" ? "/api/dev-login" : "/login");
  if (needLevel && !u.level) redirect("/placement");
  return u;
}

/** For API routes: wraps a handler, returns 401 without a session and JSON errors on throw. */
export function api(fn: (u: User, req: Request, ctx: any) => Promise<Response | object>, opts: { admin?: boolean } = {}) {
  return async (req: Request, ctx: any) => {
    const u = await currentUser();
    if (!u || (opts.admin && !u.is_admin)) return Response.json({ error: "Not signed in" }, { status: 401 });
    try {
      const r = await fn(u, req, ctx);
      return r instanceof Response ? r : Response.json(r);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.error(new URL(req.url).pathname, m);
      return Response.json({ error: m }, { status: e instanceof Bad ? 400 : 500 });
    }
  };
}
export class Bad extends Error {}
