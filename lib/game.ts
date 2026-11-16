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

/** System prompt for the live voice coach. */
export async function coachPrompt(u: User, s: { mode?: string; theme?: string; minutes?: number; kind?: string }) {
  const p = await plan(u.id);
  const bs = await bosses(u.id);
  const mode = MODES.find((m) => m.id === s.mode);
  const base = `You are a warm, patient spoken-English partner on a voice call. Speak only English. ${about(u)}
Rules: keep every turn short (1-3 sentences) so the learner speaks at least 60% of the time. Match their level: simple words and slower pace for A levels, natural speed for B2+. Ask one question at a time. The learner pauses to think in the middle of a sentence: always let them finish, never cut in, never complete their sentence for them. If they switch language, gently bring them back to English. Do not lecture on grammar; recast mistakes naturally, and only correct explicitly during the mistake hunt. Messages in [Director: ...] brackets are silent stage directions from the app: obey them, never read them aloud or mention them.`;
  if (s.kind === "situations") {
    // Live drill on the learner's own flashcards; the cards travel in the session's theme column.
    const cards = J<{ front: string; back: string }[]>(s.theme, []);
    return `You are a fast, friendly role-play partner on a voice call, drilling everyday English. ${about(u)}
The learner is memorising these phrases (Arabic meaning in brackets):
${cards.map((c, i) => `${i + 1}. "${c.front}" (${c.back})`).join("\n")}
Work through them in order, one at a time, and repeat this loop:
1. Set a real everyday scene in ONE short sentence (where they are, who you are), then say your line in character, so that the learner's most natural reply would use the phrase. Do not say the target phrase yourself in this step.
2. Wait for their reply. They pause to think in the middle of a sentence: let them finish, never cut in. They are ALLOWED to mix Arabic words into their English when they do not know a word: understand the Arabic, never comment on it, never ask them to switch language.
3. Answer at once, in this exact shape: "You could say: <their own reply in correct, natural English, each Arabic part replaced by what a native would say there>." then "A native speaker would say: <the natural reply using the target phrase>." If their reply was already natural English, say "Perfect." first.
4. Say "Your turn." and let them repeat the native version once. Then move straight to the next phrase.
Speak only English. Keep every turn short. No small talk, no grammar lectures. Messages in [Director: ...] brackets are silent stage directions from the app: obey them, never read them aloud or mention them.`;
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
