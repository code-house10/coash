import { api, Bad } from "@/lib/auth";
import { json } from "@/lib/ai";
/** Translates a sentence, or one word/phrase as it is used in that sentence, into the learner's first language. */
export const POST = api(async (u, req) => {
  const b = await req.json();
  const sentence = String(b.sentence ?? "").trim().slice(0, 600), word = String(b.word ?? "").trim().slice(0, 80);
  if (!sentence) throw new Bad("Nothing to translate.");
  const to = u.profile.firstLang || "Arabic";
  const r = await json<{ tr?: string }>(word
    ? `Spoken English sentence: """${sentence}"""
Give the meaning of "${word}" AS IT IS USED IN THIS SENTENCE, in ${to} (natural everyday wording; for Arabic, Egyptian colloquial is fine). If it is part of an idiom or phrasal verb here, translate that whole expression and name it. Return JSON {"tr": "the meaning, a few words"}`
    : `Translate this spoken English sentence into natural everyday ${to} (for Arabic, Egyptian colloquial is fine). Translate the meaning in context, not word by word. Return JSON {"tr": "the translation"}
"""${sentence}"""`, undefined, 10_000);
  return { tr: String(r.tr ?? "").slice(0, 600) };
});
