import { api, Bad } from "@/lib/auth";
import { run } from "@/lib/db";
import { VOICES, LENGTHS } from "@/lib/shared";

const hex = (s: unknown) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
const str = (s: unknown, n = 300) => String(s ?? "").slice(0, n);

/** Accepts any subset of the settings; only the fields present are changed. */
export const POST = api(async (u, req) => {
  const b = await req.json();
  const set: Record<string, string | number> = {};
  if ("voice" in b) { if (!VOICES.some(([id]) => id === b.voice)) throw new Bad("Unknown voice."); set.voice = b.voice; }
  if ("theme" in b) {
    const { mode, brand, accent } = b.theme ?? {};
    if (!["auto", "light", "dark"].includes(mode) || !hex(brand) || !hex(accent)) throw new Bad("Bad theme.");
    set.theme = JSON.stringify({ mode, brand, accent });
  }
  if ("name" in b) set.name = str(b.name, 60);
  if ("profile" in b) set.profile = JSON.stringify(Object.fromEntries(["firstLang", "job", "where", "interests", "why"].map((k) => [k, str(b.profile?.[k])])));
  if ("uiLang" in b) set.ui_lang = b.uiLang === "ar" ? "ar" : "en";
  if ("reportLang" in b) set.report_lang = b.reportLang === "ar" ? "ar" : "en";
  if ("minutesPref" in b && LENGTHS.includes(Number(b.minutesPref))) set.minutes_pref = Number(b.minutesPref);
  if ("reminder" in b && /^\d\d:\d\d$/.test(b.reminder)) set.reminder = b.reminder;
  if ("timezone" in b) { try { new Intl.DateTimeFormat("en", { timeZone: b.timezone }); set.timezone = str(b.timezone, 60); } catch {} }
  const keys = Object.keys(set);
  if (keys.length) run(`UPDATE users SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id=?`, ...Object.values(set), u.id);
  return { ok: true };
});
