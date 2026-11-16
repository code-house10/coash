import { api, Bad } from "@/lib/auth";
import { all, get, run, J } from "@/lib/db";
import { json } from "@/lib/ai";
import { today, transcript } from "@/lib/game";
import type { Turn } from "@/lib/shared";

/** CSV with quoted fields, "" escapes and newlines inside quotes (the Duo Cards export format). */
function parseCsv(s: string) {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c !== '"') f += c; else if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export const POST = api(async (u, req) => {
  const b = await req.json();
  const lang = u.ui_lang === "ar" ? "Arabic" : "English";
  const count = async () => (await get<{ n: number }>("SELECT COUNT(*) n FROM cards WHERE user_id=?", u.id))!.n;

  switch (b.action) {
    case "list":
      return { cards: await count(), saved: await all("SELECT r.id, r.scene, r.line, r.said, r.fixed, r.native, r.tip, r.ok, c.front FROM replies r LEFT JOIN cards c ON c.id=r.card_id WHERE r.user_id=? ORDER BY r.id DESC LIMIT 300", u.id) };

    case "import": {
      // Columns: front (English), back (Arabic), hint (example). A header row is skipped.
      const rows = parseCsv(clip(b.csv, 2_000_000)).filter((r) => r[0]?.trim() && r[0].trim().toLowerCase() !== "front").slice(0, 5000);
      if (!rows.length) throw new Bad("No cards found in this file.");
      const before = await count();
      for (let i = 0; i < rows.length; i += 100) {
        const part = rows.slice(i, i + 100);
        await run(`INSERT OR IGNORE INTO cards (user_id, front, back, hint) VALUES ${part.map(() => "(?,?,?,?)").join(",")}`,
          ...part.flatMap((r) => [u.id, clip(r[0], 300), clip(r[1], 300), clip(r[2], 300)]));
      }
      const cards = await count();
      return { cards, added: cards - before, inFile: rows.length };
    }

    case "next": {
      // Least-practised cards first, random among equals.
      const cards = await all<{ id: number; front: string; back: string; hint: string }>(
        "SELECT id, front, back, hint FROM cards c WHERE user_id=? ORDER BY (SELECT COUNT(*) FROM replies r WHERE r.card_id=c.id), RANDOM() LIMIT 5", u.id);
      if (!cards.length) throw new Bad("Upload your cards first.");
      const r = await json<{ items?: { id: number; scene: string; line: string }[] }>(`An English learner (level ${u.level}) is memorising these phrases:
${cards.map((c) => `${c.id}: "${c.front}" (Arabic: ${c.back}${c.hint ? `; example: ${c.hint}` : ""})`).join("\n")}
For each phrase, invent one real everyday situation (home, work, friends, shops, travel, phone calls; vary them) in which the learner's most natural reply would use that phrase or pattern.
Return JSON {"items":[{"id": phrase id, "scene": "one or two sentences in ${lang}: where the learner is, who is talking to them, and what the learner wants to get across. Never quote the English phrase.", "line": "what the other person says to the learner, in natural spoken English, one or two sentences"}]}`, undefined, 10_000);
      const items = (r.items ?? []).filter((x) => x?.scene && x?.line && cards.some((c) => c.id === Number(x.id))).map((x) => ({ cardId: Number(x.id), scene: String(x.scene), line: String(x.line) }));
      if (!items.length) throw new Error("The AI service is busy right now. Please try again in a minute.");
      return { items };
    }

    case "check": {
      const card = await get<{ id: number; front: string; back: string }>("SELECT id, front, back FROM cards WHERE id=? AND user_id=?", Number(b.cardId), u.id);
      const said = clip(b.said, 500), scene = clip(b.scene, 600), line = clip(b.line, 600);
      if (!card || !said) throw new Bad("Write your reply first.");
      const r = await json<{ ok?: boolean; fixed?: string; native?: string; tip?: string }>(`Situation: ${scene}
The other person says: "${line}"
Target phrase the learner is practising: "${card.front}" (Arabic: ${card.back})
The learner (level ${u.level}) replied, possibly mixing Arabic words into the English: """${said}"""
Return JSON {
"ok": true only if the reply was fully English, correct, and natural in this situation (it does not have to use the target phrase),
"fixed": "the learner's own reply in natural, correct English: every Arabic part replaced by what a native speaker would say at that point in this context, grammar fixed, their meaning and word choices kept wherever they already work",
"native": "what a native speaker would most naturally say in this situation, using the target phrase",
"tip": "one short tip in ${lang} on the main difference between the learner's reply and the native one"}`, undefined, 8_000);
      const fixed = clip(r.fixed, 600) || said, native = clip(r.native, 600) || card.front, tip = clip(r.tip, 400), ok = r.ok ? 1 : 0;
      const id = (await run("INSERT INTO replies (user_id, card_id, scene, line, said, fixed, native, tip, ok) VALUES (?,?,?,?,?,?,?,?,?)", u.id, card.id, scene, line, said, fixed, native, tip, ok)).lastInsertRowid;
      return { id, scene, line, said, fixed, native, tip, ok, front: card.front };
    }

    // Live voice drill: same engine as the daily session, with the cards as the script.
    case "live": {
      const cards = await all("SELECT id, front, back FROM cards c WHERE user_id=? ORDER BY (SELECT COUNT(*) FROM replies r WHERE r.card_id=c.id), RANDOM() LIMIT 12", u.id);
      if (!cards.length) throw new Bad("Upload your cards first.");
      const mins = 10, total = mins * 60_000;
      const sessionId = (await run("INSERT INTO sessions (user_id, day, kind, minutes, theme) VALUES (?,?,'situations',?,?)", u.id, today(u.timezone), mins, JSON.stringify(cards))).lastInsertRowid;
      return { sessionId, speechRate: (u.level ?? "B1").startsWith("A") ? 0.85 : 1, timeline: { warmupMs: 0, wrapAtMs: total - 25_000, hardStopMs: total + 15_000 } };
    }
    case "live-finish": {
      const s = await get("SELECT * FROM sessions WHERE id=? AND user_id=? AND kind='situations' AND status='open'", Number(b.sessionId), u.id);
      if (!s) throw new Bad("Session not found.");
      const turns = (Array.isArray(b.turns) ? b.turns : []).slice(-400) as Turn[];
      // The transcript is stored first and the session stays open until the replies are extracted, so a busy AI
      // can be retried. 'closed', not 'done': a drill is not a graded daily session and must not count towards the week or streak.
      const close = () => run("UPDATE sessions SET status='closed' WHERE id=?", s.id);
      await run("UPDATE sessions SET turns=?, seconds=? WHERE id=?", JSON.stringify(turns), Number(b.seconds) || 0, s.id);
      if (!turns.some((x) => x.role === "user")) { await close(); return { saved: [] }; }
      const cards = J<{ id: number; front: string; back: string }[]>(s.theme, []);
      const r = await json<{ items?: any[] }>(`Transcript of a spoken role-play drill (speech-to-text, so ignore spelling and punctuation). The coach set everyday situations so the learner would practise these phrases:
${cards.map((c) => `${c.id}: "${c.front}" (Arabic: ${c.back})`).join("\n")}

${transcript(turns).slice(0, 20000)}

Return one item for each situation that appears in the transcript and that the learner answered, in order. Never invent a situation or a reply that is not in the transcript; if there are none, return {"items":[]}. JSON {"items":[{
"id": phrase id from the list,
"scene": "the situation in one sentence, in ${lang}",
"line": "what the coach said in character",
"said": "the learner's reply that came BEFORE the coach's 'You could say' correction, copied exactly as transcribed, Arabic words included. Never use the repetition they say after 'Your turn'.",
"ok": true only if that reply was fully English, correct and natural,
"fixed": "that reply in natural, correct English, each Arabic part replaced by what a native speaker would say there",
"native": "what a native speaker would most naturally say, using the target phrase",
"tip": "one short tip in ${lang} on the main difference"}]}`);
      // Models sometimes invent replies: keep an item only if its "said" really occurs in the learner's speech.
      const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const spoken = norm(turns.filter((x) => x.role === "user").map((x) => x.text).join(" "));
      const saved = [];
      for (const x of (r.items ?? []).slice(0, cards.length)) {
        const card = cards.find((c) => c.id === Number(x?.id));
        if (!card || !norm(x.said) || !spoken.includes(norm(x.said))) continue;
        const row = { scene: clip(x.scene, 600), line: clip(x.line, 600), said: clip(x.said, 500), fixed: clip(x.fixed, 600) || clip(x.said, 500), native: clip(x.native, 600) || card.front, tip: clip(x.tip, 400), ok: x.ok ? 1 : 0 };
        const id = (await run("INSERT INTO replies (user_id, card_id, scene, line, said, fixed, native, tip, ok) VALUES (?,?,?,?,?,?,?,?,?)", u.id, card.id, row.scene, row.line, row.said, row.fixed, row.native, row.tip, row.ok)).lastInsertRowid;
        saved.push({ id, ...row, front: card.front });
      }
      await close();
      return { saved };
    }

    case "delete": await run("DELETE FROM replies WHERE id=? AND user_id=?", Number(b.id), u.id); return { ok: true };
  }
  throw new Bad("Unknown action.");
});
