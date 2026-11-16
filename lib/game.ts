import { all, get, run, J } from "./db";
import type { User } from "./auth";
import { json } from "./ai";
import { LEVELS, MODES, PLANS, type Turn } from "./shared";

export const today = (tz: string, d = new Date()) => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d); } catch { return d.toISOString().slice(0, 10); }
};
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);

export async function minutes(u: User) {
  const day = today(u.timezone);
  const expired = !!u.access_until && u.access_until < day;
  const limit = expired ? 0 : (PLANS[u.plan] ?? PLANS.trial).minutes;
  const used = (await get<{ s: number }>("SELECT COALESCE(SUM(seconds),0) s FROM sessions WHERE user_id=? AND day=? AND kind='daily'", u.id, day))!.s / 60;
  return { limit, used: Math.round(used), left: Math.max(0, Math.floor(limit - used)), expired };
}

export const plan = async (userId: number) => {
  const r = await get("SELECT * FROM plans WHERE user_id=? ORDER BY version DESC LIMIT 1", userId);
  return r ? { version: r.version as number, created: r.created as string, ...(J(r.data, {}) as PlanData) } : null;
};
export type PlanData = { goals: string[]; focus: { title: string; why: string; wrong: string; right: string }[]; themes: Record<string, string[]> };

export const bosses = async (userId: number) => await all("SELECT * FROM mistakes WHERE user_id=? AND hp>0 ORDER BY count DESC", userId);

const about = (u: User) =>
  `Name: ${u.name || "the learner"}. Level: ${u.level ?? "unknown"}. First language: ${u.profile.firstLang || "Arabic"}. Job: ${u.profile.job || "-"}. ` +
  `Uses English: ${u.profile.where || "-"}. Interests: ${u.profile.interests || "-"}. Goal: ${u.profile.why || "-"}.`;

/** How a flashcard is read: the reusable pattern is what gets drilled, the rest of the card is one example of it. */
export const CHUNK = `Each card holds a CHUNK: the fixed, reusable pattern the learner must master. If part of the card is inside quotation marks, that quoted part is the chunk and the rest of the sentence is only one example of using it. If nothing is quoted, the whole card is the chunk. Numbers, times, names, objects and "..." inside a chunk are SLOTS that change with the situation ("went two days without" is the pattern "went <time> without <something>"; "two hours" or "a week" are just as right). The chunk's own words stay fixed; the slots and everything around it must fit the situation.`;

/** System prompt for the live voice coach. */
export async function coachPrompt(u: User, s: { mode?: string; theme?: string; minutes?: number; kind?: string }) {
  const p = await plan(u.id);
  const bs = await bosses(u.id);
  const mode = MODES.find((m) => m.id === s.mode);
  const base = `You are a warm, patient spoken-English partner on a voice call. Speak only English. ${about(u)}
Rules: keep every turn short (1-3 sentences) so the learner speaks at least 60% of the time. Match their level: simple words and slower pace for A levels, natural speed for B2+. Ask one question at a time. The learner pauses to think in the middle of a sentence: always let them finish, never cut in, never complete their sentence for them. If they switch language, gently bring them back to English. Do not lecture on grammar; recast mistakes naturally, and only correct explicitly during the mistake hunt. Messages in [Director: ...] brackets are silent stage directions from the app: obey them, never read them aloud or mention them.`;
  if (s.kind === "situations") {
    // Live role-play on the learner's own flashcards. The app feeds one scene at a time (a domain plus a few cards)
    // through Director cues, so the screen always knows which expressions the scene is about.
    return `You are a friendly English speaking coach AND a role-play partner on a voice call with an Egyptian Arabic speaker. ${about(u)}
The app gives you scenes one at a time in [Director: ...] messages. Each names an everyday DOMAIN and a few TARGET chunks the learner is memorising, with their Arabic meaning.
${CHUNK}

WHEN A SCENE STARTS
Invent ONE specific, realistic everyday situation in that domain, with details that are different from the cards' own examples. In two short sentences tell the learner where you both are and who you are to them, including the facts they will need to answer (what just happened, how long, who is involved). Then become that person and say a natural line of one to three sentences that ENDS with a direct question or request whose most natural answer needs the first target chunk. Never stop on a bare statement: the learner must always know what they are expected to answer. Do not say the target chunks yourself before the learner has had a try.

EVERY TIME THE LEARNER ANSWERS
1. Coach, in ONE short sentence. If the reply had a mistake, Arabic words, or missed the chunk the moment called for: "You could say: <their own idea the way a native speaker would say it here, with the chunk, keeping their details>". If it was already right, only a quick natural reaction ("Nice.", "Exactly.") with no repeating and no long praise.
2. Straight back in character, ANSWER WHAT THEY ACTUALLY SAID the way a real person would: react to it, add a detail of your own, and finish with a question or remark that naturally invites a target chunk they have not used correctly yet. It must be one real conversation where each line follows from the last. Never a list of unrelated prompts, never "now use the phrase...", never ask them to repeat after you.

RULES
- A target counts as used when its core words and meaning come out naturally. Another tense, pronoun, number, time or name is fine ("two hours" for a card that says "two days" is correct). Never push them back to the card's example sentence.
- The learner MAY mix Arabic into the English for words they do not know. Their speech is transcribed, so Arabic can also appear as odd English words that make no sense but sound like Egyptian Arabic: work out what they meant from context. Never comment on the Arabic and never ask them to switch language; just give the natural English in your "You could say".
- They pause to think in the middle of a sentence: let them finish, never cut in. If they are silent or lost, ask the question again more simply, with a small hint.
- When every target of the scene has been used correctly, or after about six learner turns, end the scene in character in one line, then say "Tap Next scene when you're ready." Never start another scene yourself: wait for the Director.
CHECK EVERY TURN BEFORE YOU SPEAK: (a) you are not saying a target chunk the learner has not tried yet, except inside "You could say"; (b) if they used Arabic or made a mistake, your turn starts with "You could say: ..."; (c) after that sentence you carry on in character in the same turn; (d) your turn ends with a question or request for the learner.
Speak only English. Keep every turn short. No grammar lectures. Messages in [Director: ...] brackets are silent stage directions from the app: obey them, never read them aloud or mention them.`;
  }
  if (s.kind === "placement")
    return `${base}\nThis is a 5-minute placement chat. Start very easy and make each question a bit harder (past, future, opinions, hypotheticals) until the learner struggles, so you can find their level. Never tell them their level.`;
  if (s.kind === "stage")
    return `${base}\nThis is a short stage-test interview to check whether the learner is ready to move up from ${u.level}. Ask questions that need the next level's language.`;
  return `${base}
Today's session: ${s.minutes} minutes, mode "${mode?.name}": ${mode?.how} Theme: ${s.theme}
${p ? `Focus points to give practice on: ${p.focus.map((f) => f.title).join("; ")}.` : ""}
${bs.length ? `Recurring mistakes to set traps for (create chances to use the right form): ${bs.map((b) => `"${b.wrong}" -> "${b.fix}"`).join("; ")}.` : ""}`;
}

export async function writePlan(u: User, evidence: string) {
  const data = await json<PlanData>(
    `Write a personal spoken-English study plan as JSON for this learner. ${about(u)}
Evidence of their English: ${evidence.slice(0, 6000)}
Return: {"goals": [5 concrete can-do aims for this stage], "focus": [5 items {"title","why" (one sentence, personal),"wrong" (typical wrong sentence),"right" (corrected)}], "themes": {${MODES.map((m) => `"${m.id}": [3 short ${m.name} prompts tailored to their job and interests]`).join(", ")}}}`,
  );
  const v = ((await get<{ v: number }>("SELECT COALESCE(MAX(version),0) v FROM plans WHERE user_id=?", u.id))!.v) + 1;
  await run("INSERT INTO plans (user_id, version, data) VALUES (?,?,?)", u.id, v, JSON.stringify(data));
}

export async function pickSession(u: User) {
  const p = await plan(u.id);
  const n = (await get<{ n: number }>("SELECT COUNT(*) n FROM sessions WHERE user_id=? AND kind='daily'", u.id))!.n;
  const mode = MODES[n % MODES.length]; // rotate so every mode comes round
  const themes = p?.themes?.[mode.id] ?? [];
  const theme = themes[Math.floor(n / MODES.length) % (themes.length || 1)] ?? "Your day so far and your plans for the week.";
  return { mode, theme };
}

const transcript = (turns: Turn[]) => turns.map((t) => `${t.role === "user" ? "LEARNER" : "COACH"}: ${t.text}`).join("\n");

/** Grades a finished session, stores the report, and updates XP, streak, bosses and badges. */
export async function finishSession(u: User, s: any, turns: Turn[], seconds: number, speaking: number, provider: string) {
  const day = today(u.timezone);
  const bs = await bosses(u.id);
  const lang = u.report_lang === "ar" ? "Arabic (keep quoted English sentences in English)" : "English";
  const r = await json(
    `Grade this spoken-English practice session. ${about(u)} Write all prose in ${lang}, addressed to the learner as "you".
Known recurring mistakes: ${JSON.stringify(bs.map((b) => ({ id: b.id, wrong: b.wrong, fix: b.fix })))}
Transcript (speech-to-text, so ignore spelling and punctuation):
${transcript(turns).slice(0, 20000)}

Return JSON: {"summary": "2 sentences", "scores": {"fluency","grammar","vocabulary","comprehension"} each 0-100 relative to CEFR C2=100,
"mistakes": [up to 6 {"type": "grammar"|"vocabulary"|"pronunciation", "key": "short stable snake_case label of the error pattern", "wrong": "exact learner words", "fix": "corrected", "why": "one short line"}],
"strengths": [2-3 strings quoting the learner], "weak": [2-3], "challenges": [1-2], "improve": [exactly 3], "tomorrow": {"title","why"},
"hardWords": number of times the learner tried vocabulary above their level, "bossHits": [ids of known recurring mistakes where the learner used the RIGHT form unprompted]}`,
  );

  // XP: 10 per minute, +5 per stretch of vocabulary (max 5), +10 per boss hit.
  const mins = Math.max(1, Math.round(seconds / 60));
  const xpLines: [string, number][] = [[`Session time (${mins} min)`, mins * 10]];
  const hw = Math.min(5, Number(r.hardWords) || 0);
  if (hw) xpLines.push([`Tried harder vocabulary ×${hw}`, hw * 5]);

  const newBadges: string[] = [];
  const badge = async (id: string) => { if ((await run("INSERT OR IGNORE INTO badges VALUES (?,?,?)", u.id, id, day)).changes) newBadges.push(id); };

  for (const id of (r.bossHits ?? []) as number[]) {
    const b = bs.find((x) => x.id === id);
    if (!b) continue;
    await run("UPDATE mistakes SET hp = hp - 1 WHERE id=?", id);
    xpLines.push([`Hit a boss: ${b.fix}`, 10]);
    if (b.hp <= 1) await badge("boss");
  }
  for (const m of (r.mistakes ?? []) as any[]) {
    const old = await get("SELECT * FROM mistakes WHERE user_id=? AND key=?", u.id, m.key);
    m.isNew = !old;
    if (!old) await run("INSERT INTO mistakes (user_id,key,wrong,fix) VALUES (?,?,?,?)", u.id, m.key, m.wrong, m.fix);
    // A mistake seen in a second session becomes a boss with 3 health.
    else await run("UPDATE mistakes SET count=count+1, hp=CASE WHEN hp>0 THEN hp ELSE 3 END, wrong=?, fix=? WHERE id=?", m.wrong, m.fix, old.id);
  }

  // Streak: same day keeps it, yesterday extends it, a one-day gap spends a freeze, else reset.
  let { streak, freezes } = u;
  if (u.last_day !== day) {
    if (u.last_day === addDays(day, -1)) streak++;
    else if (u.last_day === addDays(day, -2) && freezes > 0) { streak++; freezes--; }
    else streak = 1;
    if (streak % 7 === 0) { freezes = Math.min(2, freezes + 1); await badge("week"); }
  }
  const xp = xpLines.reduce((a, [, n]) => a + n, 0);
  await run("UPDATE users SET xp=xp+?, streak=?, freezes=?, last_day=? WHERE id=?", xp, streak, freezes, day, u.id);
  await run("UPDATE sessions SET status='done', turns=?, seconds=?, speaking=?, provider=? WHERE id=?", JSON.stringify(turns), seconds, speaking, provider, s.id);

  const done = (await get<{ n: number }>("SELECT COUNT(*) n FROM sessions WHERE user_id=? AND kind='daily' AND status='done'", u.id))!.n;
  if (done === 1) await badge("first");
  if (done === 10) await badge("ten");

  const mode = MODES.find((m) => m.id === s.mode);
  const data = { ...r, xp, xpLines, streak, minutes: mins, planned: s.minutes, speakingSeconds: Math.round(speaking), spoke: Math.round((speaking / Math.max(1, seconds)) * 100), mode: mode && { emoji: mode.emoji, name: mode.name, nameAr: mode.nameAr }, theme: s.theme, provider, badges: newBadges };
  const reportId = Number((await run("INSERT INTO reports (user_id, session_id, day, data) VALUES (?,?,?,?)", u.id, s.id, day, JSON.stringify(data))).lastInsertRowid);

  // Weekly review every 7th session: a new plan version from the week's reports.
  const weeklyDue = done % 7 === 0;
  if (weeklyDue) {
    const week = (await all("SELECT data FROM reports WHERE user_id=? ORDER BY id DESC LIMIT 7", u.id)).map((x) => { const d = J(x.data, {} as any); return { summary: d.summary, mistakes: d.mistakes, weak: d.weak }; });
    await writePlan(u, `Last 7 session reports: ${JSON.stringify(week)}`).catch((e) => console.error("weekly plan", e));
  }
  return { reportId, weeklyDue };
}

export const nextLevel = (l: string) => LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(l) + 1)];
export { transcript };
