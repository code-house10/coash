import { api, Bad } from "@/lib/auth";
import { run } from "@/lib/db";
import { minutes, pickSession, today } from "@/lib/game";
import { LENGTHS } from "@/lib/shared";

export const POST = api(async (u, req) => {
  const want = Number((await req.json()).minutes);
  const m = await minutes(u);
  if (!u.level) throw new Bad("Take the placement test first.");
  if (m.expired) throw new Bad("Your access has ended. Contact the person who invited you to renew.");
  if (!LENGTHS.includes(want) || want > m.left) throw new Bad("You have used today's coach minutes. See you tomorrow!");
  const { mode, theme } = await pickSession(u);
  const sessionId = Number((await run("INSERT INTO sessions (user_id, day, minutes, mode, theme) VALUES (?,?,?,?,?)", u.id, today(u.timezone), want, mode.id, theme)).lastInsertRowid);
  const total = want * 60_000;
  return {
    sessionId, speechRate: (u.level ?? "B1").startsWith("A") ? 0.85 : 1,
    mode: { emoji: mode.emoji, name: mode.name, nameAr: mode.nameAr }, theme,
    timeline: { warmupMs: Math.min(60_000, total * 0.15), mistakesAtMs: want >= 10 ? total * 0.7 : null, wrapAtMs: total - 25_000, hardStopMs: total + 15_000 },
  };
});
