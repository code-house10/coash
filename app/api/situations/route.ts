import { api, Bad } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { json } from "@/lib/ai";

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
      return { cards, added: cards - before };
    }

    case "next": {
      // Least-practised cards first, random among equals.
      const cards = await all<{ id: number; front: string; back: string; hint: string }>(
        "SELECT id, front, back, hint FROM cards c WHERE user_id=? ORDER BY (SELECT COUNT(*) FROM replies r WHERE r.card_id=c.id), RANDOM() LIMIT 5", u.id);
      if (!cards.length) throw new Bad("Upload your cards first.");
      const r = await json<{ items?: { id: number; scene: string; line: string }[] }>(`An English learner (level ${u.level}) is memorising these phrases:
${cards.map((c) => `${c.id}: "${c.front}" (Arabic: ${c.back}${c.hint ? `; example: ${c.hint}` : ""})`).join("\n")}
For each phrase, invent one real everyday situation (home, work, friends, shops, travel, phone calls; vary them) in which the learner's most natural reply would use that phrase or pattern.
Return JSON {"items":[{"id": phrase id, "scene": "one or two sentences in ${lang}: where the learner is, who is talking to them, and what the learner wants to get across. Never quote the English phrase.", "line": "what the other person says to the learner, in natural spoken English, one or two sentences"}]}`);
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
"tip": "one short tip in ${lang} on the main difference between the learner's reply and the native one"}`);
      const fixed = clip(r.fixed, 600) || said, native = clip(r.native, 600) || card.front, tip = clip(r.tip, 400), ok = r.ok ? 1 : 0;
      const id = (await run("INSERT INTO replies (user_id, card_id, scene, line, said, fixed, native, tip, ok) VALUES (?,?,?,?,?,?,?,?,?)", u.id, card.id, scene, line, said, fixed, native, tip, ok)).lastInsertRowid;
      return { id, scene, line, said, fixed, native, tip, ok, front: card.front };
    }

    case "delete": await run("DELETE FROM replies WHERE id=? AND user_id=?", Number(b.id), u.id); return { ok: true };
  }
  throw new Bad("Unknown action.");
});
