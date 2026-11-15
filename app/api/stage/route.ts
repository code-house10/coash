import { api, Bad } from "@/lib/auth";
import { get, run, J } from "@/lib/db";
import { json } from "@/lib/ai";
import { nextLevel, today } from "@/lib/game";

type Test = { passage: string; questions: { q: string; options: string[]; answer: number }[]; topic: string; target: string };

export const POST = api(async (u, req) => {
  const b = await req.json();
  const target = nextLevel(u.level!);
  if (target === u.level) throw new Bad("You are already at the top stage.");

  if (b.action === "start") {
    const test = await json<Test>(
      `Create a CEFR ${target} speaking-and-listening test for an English learner (job: ${u.profile.job || "-"}, interests: ${u.profile.interests || "-"}).
Return JSON {"passage": "90-120 word spoken-style passage at ${target} difficulty", "questions": [3 items {"q", "options": [4 strings], "answer": index 0-3}] about the passage, "topic": "a 60-second monologue task that needs ${target} language"}`,
    );
    run("INSERT OR REPLACE INTO tests (user_id, kind, data) VALUES (?, 'stage', ?)", u.id, JSON.stringify({ ...test, target }));
    return { target, passage: test.passage, topic: test.topic, questions: test.questions.map(({ q, options }) => ({ q, options })) };
  }

  if (b.action === "finish") {
    const test = J<Test | null>(get("SELECT data FROM tests WHERE user_id=? AND kind='stage'", u.id)?.data, null);
    if (!test || test.target !== target) throw new Bad("Start the test first.");
    const listening = test.questions.filter((q, i) => b.answers?.[i] === q.answer).length;
    const v = await json<{ ready: boolean; feedback: string }>(
      `A learner at ${u.level} wants to move up to ${target}. Task: "${test.topic}". Their 60-second answer (speech-to-text): """${String(b.transcript ?? "").slice(0, 3000)}"""
Is their spoken English at ${target} or above? Be fair but strict. Return JSON {"ready": boolean, "feedback": "2-3 encouraging sentences in ${u.ui_lang === "ar" ? "Arabic" : "English"} saying what was good and what is missing"}`,
    );
    const passed = listening >= 2 && !!v.ready;
    run("DELETE FROM tests WHERE user_id=? AND kind='stage'", u.id); // one attempt per generated test
    if (passed) {
      run("UPDATE users SET level=?, xp=xp+100 WHERE id=?", target, u.id);
      run("INSERT OR IGNORE INTO badges VALUES (?, 'stage', ?)", u.id, today(u.timezone));
    }
    return { passed, listening, feedback: v.feedback, level: passed ? target : u.level };
  }
  throw new Bad("Unknown action.");
});
