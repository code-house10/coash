import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { minutes, today, bosses } from "@/lib/game";
import { makeT } from "@/lib/t";
import { LEVELS } from "@/lib/shared";
import { SessionRunner } from "@/components/SessionRunner";

export default async function Home() {
  const u = await pageUser();
  const t = makeT(u.ui_lang);
  const day = today(u.timezone);
  const m = await minutes(u);
  const doneToday = u.last_day === day;
  // The current week, Monday first, with the days that have a finished session.
  const dow = (new Date(day).getUTCDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(day) + (i - dow) * 864e5).toISOString().slice(0, 10));
  const active = new Set((await all("SELECT DISTINCT day FROM sessions WHERE user_id=? AND status='done' AND day>=?", u.id, week[0])).map((r) => r.day));
  const last = await get("SELECT id, day FROM reports WHERE user_id=? ORDER BY id DESC LIMIT 1", u.id);
  const at = LEVELS.indexOf(u.level!);

  return (
    <>
      <div>
        <h1 className="text-2xl font-black">{t(doneToday ? "Nice one today, {name}." : "Ready to talk, {name}?", { name: u.name || "" })}</h1>
        <p className="text-muted">{t(doneToday ? "See you tomorrow. Or right now, if you like." : "A few minutes is enough.")}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[["🔥", u.streak, "day streak"], ["🧭", u.level, "your stage"], ["⚡", u.xp, "XP"]].map(([icon, v, label]) => (
          <div key={label as string} className="card !p-3"><p>{icon}</p><p className="text-2xl font-black">{v}</p><p className="text-xs text-muted">{t(label as string)}</p></div>
        ))}
      </div>
      <div className="card">
        <div className="mb-2 flex justify-between text-sm font-bold"><span>{t("This week")}</span><span>🧊 {t("Streak freezes")}: {u.freezes}</span></div>
        <div className="flex justify-between">
          {week.map((d, i) => (
            <div key={d} className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${active.has(d) ? "grad" : d === day ? "border-2 border-brand" : "bg-bg text-muted"}`}>{active.has(d) ? "✓" : "MTWTFSS"[i]}</div>
          ))}
        </div>
      </div>
      <SessionRunner pref={u.minutes_pref} left={m.left} doneToday={doneToday} />
      <div className="card">
        <div className="mb-3 flex justify-between font-black"><span>{t("Your journey")}</span><Link href="/plan" className="text-brand">{t("See the map")}</Link></div>
        <div className="flex items-center justify-between">
          {LEVELS.map((l, i) => <span key={l} className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black ${i <= at ? "grad" : "bg-bg text-muted"} ${i === at ? "ring-4 ring-line" : ""}`}>{l}</span>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/plan#bosses" className="card"><p className="text-3xl">👾</p><p className="font-black">{t("Error bosses")} · {(await bosses(u.id)).length}</p><p className="text-sm text-muted">{t("Use the right form to beat them.")}</p></Link>
        <Link href={last ? `/reports/${last.id}` : "/reports"} className="card"><p className="text-3xl">📄</p><p className="font-black">{t("Last report")}</p><p className="text-sm text-muted">{last?.day ?? "—"}</p></Link>
      </div>
    </>
  );
}
