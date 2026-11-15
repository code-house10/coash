import { randomBytes } from "node:crypto";
import { api, Bad } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { PLANS } from "@/lib/shared";

const code = () => randomBytes(5).toString("hex").toUpperCase();

export const POST = api(async (_u, req) => {
  const b = await req.json();
  switch (b.action) {
    case "list":
      return {
        users: await all("SELECT id, email, name, plan, access_until, level, xp, streak, last_day FROM users ORDER BY id"),
        codes: await all("SELECT code, kind, email FROM codes WHERE used=0 ORDER BY created DESC"),
        events: await all("SELECT provider, type, reason, created FROM events ORDER BY id DESC LIMIT 20"),
      };
    case "invite": { const c = code(); await run("INSERT INTO codes (code, kind) VALUES (?, 'invite')", c); return { code: c }; }
    case "reset": {
      const email = String(b.email ?? "").toLowerCase();
      if (!await get("SELECT 1 FROM users WHERE email=?", email)) throw new Bad("No account with this email.");
      const c = code(); await run("INSERT INTO codes (code, kind, email) VALUES (?, 'reset', ?)", c, email); return { code: c };
    }
    case "plan":
      if (!PLANS[b.plan] || !/^\d{4}-\d\d-\d\d$/.test(b.until)) throw new Bad("Bad plan or date.");
      await run("UPDATE users SET plan=?, access_until=? WHERE id=?", b.plan, b.until, Number(b.id));
      return { ok: true };
  }
  throw new Bad("Unknown action.");
}, { admin: true });
