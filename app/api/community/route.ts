import { api, Bad } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { json } from "@/lib/ai";
import { roomOf } from "@/lib/shared";

const MIMES = ["audio/mp4", "audio/webm", "audio/ogg"];

export const POST = api(async (u, req) => {
  const b = await req.json();
  const room = roomOf(u.level ?? "A1"); // users only ever see the room for their own level
  const after = Number(b.after) || 0;
  const list = () => ({
    room,
    messages: all(
      `SELECT * FROM (SELECT id, user_id, name, text, seconds, created, audio IS NOT NULL AS voice FROM messages WHERE room=? AND id>? ORDER BY id DESC LIMIT 60) ORDER BY id`, room, after,
    ).map((m) => ({ ...m, mine: m.user_id === u.id, user_id: undefined })),
  });
  // First post of the UTC day earns a little XP.
  const reward = () => {
    const n = get<{ n: number }>("SELECT COUNT(*) n FROM messages WHERE user_id=? AND created >= date('now')", u.id)!.n;
    if (n !== 1) return undefined;
    run("UPDATE users SET xp=xp+5 WHERE id=?", u.id);
    return { xp: 5 };
  };

  switch (b.action) {
    case "list": return { ...list(), rulesOk: !!u.rules_ok };
    case "accept-rules": run("UPDATE users SET rules_ok=1 WHERE id=?", u.id); return { ok: true };
    case "send": {
      const text = String(b.text ?? "").trim().slice(0, 500);
      if (!text) throw new Bad("Write something first.");
      run("INSERT INTO messages (room, user_id, name, text) VALUES (?,?,?,?)", room, u.id, u.name || "Learner", text);
      return { ...list(), sent: reward() };
    }
    case "voice": {
      const audio = Buffer.from(String(b.audio ?? ""), "base64");
      const mime = String(b.mime ?? "").split(";")[0];
      if (!audio.length || audio.length > 1_500_000 || !MIMES.includes(mime)) throw new Bad("Voice note missing or too long.");
      run("INSERT INTO messages (room, user_id, name, audio, mime, seconds) VALUES (?,?,?,?,?,?)", room, u.id, u.name || "Learner", audio, mime, Math.min(90, Number(b.seconds) || 0));
      return { ...list(), sent: reward() };
    }
    case "delete": run("DELETE FROM messages WHERE id=? AND user_id=?", Number(b.id), u.id); return { ok: true };
    case "polish":
      return json(`An English learner (level ${u.level}) wants to post this chat message: """${String(b.text ?? "").slice(0, 500)}"""
Return JSON {"better": "the same message in natural, correct English, same meaning and tone", "tip": "one short tip about the main fix, in ${u.ui_lang === "ar" ? "Arabic" : "English"}; empty string if it was already fine"}`);
  }
  throw new Bad("Unknown action.");
});
