import { api, Bad } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { json } from "@/lib/ai";
import { today, transcript, writePlan } from "@/lib/game";
import { LEVELS } from "@/lib/shared";
import { SWIPE } from "@/lib/placement";

export const POST = api(async (u, req) => {
  const b = await req.json();

  if (b.action === "speaking-start") {
    const sessionId = Number((await run("INSERT INTO sessions (user_id, day, kind, minutes) VALUES (?,?,'placement',5)", u.id, today(u.timezone))).lastInsertRowid);
    return { sessionId, speechRate: 0.9, timeline: { warmupMs: 30_000, mistakesAtMs: null, wrapAtMs: 275_000, hardStopMs: 315_000 } };
  }

  if (b.action === "finish") {
    const picks: boolean[] = Array.isArray(b.picks) ? b.picks : [];
    const right = SWIPE.filter((q, i) => picks[i] === q.ok).map((q) => q.level);
    const turns = Array.isArray(b.turns) ? b.turns : [];
    if (b.sessionId) await run("UPDATE sessions SET status='done', turns=?, seconds=? WHERE id=? AND user_id=? AND kind='placement'", JSON.stringify(turns), Math.min(330, Number(b.actualSeconds) || 0), Number(b.sessionId), u.id);
    const evidence = `Grammar judgement quiz: ${right.length}/${SWIPE.length} right (levels of the ones they got right: ${right.join(",")}).
Writing sample: """${String(b.text ?? "").slice(0, 1500)}"""
Speaking transcript (speech-to-text): ${turns.length ? transcript(turns).slice(0, 8000) : "(skipped)"}`;
    const r = await json<{ level: string; why: string }>(
      `Place this English learner on this scale: ${LEVELS.join(", ")}. Weigh speaking most, then writing, then the quiz. With no speaking sample be conservative.\n${evidence}\nReturn JSON {"level": one value from the scale, "why": "two friendly sentences to the learner in ${u.ui_lang === "ar" ? "Arabic" : "English"}"}`,
    );
    if (!LEVELS.includes(r.level)) throw new Bad("Could not work out a level. Please try again.");
    await run("UPDATE users SET level=? WHERE id=?", r.level, u.id);
    await run("INSERT OR REPLACE INTO tests (user_id, kind, data) VALUES (?, 'placement', ?)", u.id, JSON.stringify({ ...r, quiz: right.length, day: today(u.timezone) }));
    await writePlan({ ...u, level: r.level }, evidence);
    return r;
  }

  if (b.action === "result") return JSON.parse((await get("SELECT data FROM tests WHERE user_id=? AND kind='placement'", u.id))?.data ?? "{}");
  throw new Bad("Unknown action.");
});
