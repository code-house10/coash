import { api, Bad } from "@/lib/auth";
import { all, get, run, J } from "@/lib/db";
import { json } from "@/lib/ai";
import { CHUNK, today, transcript } from "@/lib/game";
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

// Everyday domains a live scene is set in: [English name, Arabic name, what it covers].
const DOMAINS = [
  ["Work & office", "الشغل والمكتب", "work, office, meetings, coworkers, boss"],
  ["Restaurant & café", "المطعم والكافيه", "restaurant, cafe, ordering food"],
  ["Shopping", "التسوق", "shopping, returns, prices, supermarket"],
  ["Travel & airport", "السفر والمطار", "airport, travel, hotel check-in, tourism"],
  ["Doctor & pharmacy", "الدكتور والصيدلية", "doctor, pharmacy, feeling sick"],
  ["Bank & money", "البنك والفلوس", "bank, transfers, bills, money problems"],
  ["Getting around", "المواصلات", "taxi, ride apps, bus, traffic, directions"],
  ["Home & family", "البيت والأسرة", "family, home, chores, parents, kids"],
  ["Friends & going out", "الأصحاب والخروجات", "friends, plans, going out, catching up"],
  ["Phone & customer service", "التليفون وخدمة العملاء", "phone calls, customer service, complaints"],
  ["Job interview", "مقابلة شغل", "job interview, career, CV"],
  ["Study", "الدراسة", "school, university, exams, courses"],
  ["Neighbours & housing", "الجيران والسكن", "neighbours, renting, landlord, repairs"],
  ["Sport & gym", "الرياضة والجيم", "sports, gym, football match"],
  ["Problems & emergencies", "مشاكل وطوارئ", "emergencies, accidents, lost items, police"],
  ["Technology", "التكنولوجيا", "phones, computers, internet, apps"],
  ["Feelings & relationships", "المشاعر والعلاقات", "feelings, relationships, apologies, arguments"],
] as const;

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
      const r = await json<{ items?: { id: number; scene: string; line: string }[] }>(`An English learner (level ${u.level}) is memorising these cards:
${cards.map((c) => `${c.id}: ${c.front} (Arabic: ${c.back}${c.hint ? `; example: ${c.hint}` : ""})`).join("\n")}
${CHUNK}
For each card, invent one complete, real everyday situation (home, work, friends, shops, travel, phone calls; vary them) in which the learner's most natural reply needs the chunk. Use details that are DIFFERENT from the card's own example: other people, numbers, times, places.
Return JSON {"items":[{"id": card id, "scene": "two or three sentences in ${lang}: where the learner is, who is talking to them, what has just happened, and the facts the learner needs for their answer (how long, who, what). Never quote the English chunk.", "line": "what the other person says to the learner, in natural spoken English, one or two sentences. It MUST end with a direct question or request to the learner whose natural answer needs the chunk; never a bare statement."}]}`, undefined, 10_000);
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
Card the learner is practising: ${card.front} (Arabic: ${card.back})
${CHUNK}
The learner (level ${u.level}) replied, possibly mixing Arabic words into the English: """${said}"""
Return JSON {
"ok": true if the reply was fully English, correct, and natural in this situation. Using the chunk with their own details (other numbers, times, people than the card's example) is correct,
"fixed": "the learner's own reply in natural, correct English: every Arabic part replaced by what a native speaker would say at that point in this context, grammar fixed, their meaning, details and word choices kept wherever they already work",
"native": "what a native speaker would most naturally answer in THIS situation: the chunk kept exactly, its slots filled with this situation's details (and the learner's own details when they fit). Never copy the card's example sentence. If the learner's reply already does this, repeat it",
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
      // One scene = one everyday domain + three cards, played as a single continuing conversation.
      const domains = [...DOMAINS].sort(() => Math.random() - 0.5);
      const scenes = Array.from({ length: Math.ceil(cards.length / 3) }, (_, i) => {
        const targets = cards.slice(i * 3, i * 3 + 3), [en, ar, about] = domains[i % domains.length];
        return {
          title: u.ui_lang === "ar" ? ar : en, targets: targets.map((c) => ({ front: c.front, back: c.back })),
          cue: `[Director: start a new scene now. Domain: ${about}. Target chunks: ${targets.map((c, j) => `${j + 1}) ${c.front} (Arabic: ${c.back})`).join("  ")}]`,
        };
      });
      return { sessionId, scenes, speechRate: (u.level ?? "B1").startsWith("A") ? 0.85 : 1, timeline: { warmupMs: 0, wrapAtMs: total - 25_000, hardStopMs: total + 15_000 } };
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
      const r = await json<{ items?: any[] }>(`Transcript of a spoken role-play drill (speech-to-text, so ignore spelling and punctuation). The coach set everyday situations so the learner would practise these cards:
${cards.map((c) => `${c.id}: ${c.front} (Arabic: ${c.back})`).join("\n")}
${CHUNK}

${transcript(turns).slice(0, 20000)}

The drill is a continuing conversation: in each scene the coach plays a person, and after each learner reply may say "You could say: ..." before carrying on in character.
Return one item for each learner reply worth reviewing, in order: every reply the coach corrected with "You could say", and every reply that used (or clearly should have used) one of the target chunks. Skip greetings and one-word answers. Never invent a reply that is not in the transcript; if there are none, return {"items":[]}. JSON {"items":[{
"id": card id from the list,
"scene": "the situation in one or two sentences, in ${lang}",
"line": "the question the coach asked in character",
"said": "that learner reply, copied exactly as transcribed, Arabic words included",
"ok": true if that reply was fully English, correct and natural. Using the chunk with their own details is correct,
"fixed": "that reply in natural, correct English, each Arabic part replaced by what a native speaker would say there, their own details kept",
"native": "the coach's own 'You could say' sentence for that reply if there is one; otherwise the most natural way to say it here using the chunk with this situation's details. Never the card's example sentence",
"tip": "one short tip in ${lang} on the main difference"}]}`);
      // Models sometimes invent replies: keep an item only if its "said" really occurs in the learner's speech.
      const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const spoken = norm(turns.filter((x) => x.role === "user").map((x) => x.text).join(" "));
      const saved = [];
      for (const x of (r.items ?? []).slice(0, 40)) {
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
