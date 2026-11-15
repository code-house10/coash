import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { plan, bosses, nextLevel } from "@/lib/game";
import { makeT } from "@/lib/t";
import { LEVELS, MODES, BADGES } from "@/lib/shared";

export default async function Plan() {
  const u = await pageUser();
  const t = makeT(u.ui_lang);
  const p = plan(u.id);
  const bs = bosses(u.id);
  const badges = all("SELECT * FROM badges WHERE user_id=?", u.id);
  const top = u.level === "C2";
  return (
    <>
      <div><h1 className="text-2xl font-black">{t("Your plan")}</h1><p className="text-muted">{t("Plan version {n}.", { n: p?.version ?? 0 })} {t("All levels are estimates.")}</p></div>
      <div className="card flex flex-wrap gap-2">
        {LEVELS.map((l) => <span key={l} className="chip" data-on={l === u.level}>{l}{l === u.level ? ` · ${t("you")}` : ""}</span>)}
      </div>
      {!top && (
        <div className="card">
          <p className="font-black">⚔️ {t("Stage test")}: {u.level} → {nextLevel(u.level!)}</p>
          <p className="mb-3 text-sm text-muted">{t("Moving up needs a win in the stage test. You can try any time.")}</p>
          <Link href="/stage-test" className="btn grad inline-block">{t("Try it")}</Link>
        </div>
      )}
      {p && (
        <>
          <div className="card"><p className="mb-2 font-black">🎯 {t("What you are aiming for at this stage")}</p><ul className="list-disc space-y-1 ps-5 text-sm">{p.goals?.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
          <div className="card">
            <p className="mb-2 font-black">🔍 {t("Your focus list")}</p>
            {p.focus?.map((f, i) => (
              <div key={i} className="mb-3 text-sm"><p className="font-bold">{f.title}</p><p className="text-muted">{f.why}</p><p dir="ltr"><span className="text-red-500 line-through">{f.wrong}</span> → <span className="font-bold text-green-600">{f.right}</span></p></div>
            ))}
          </div>
        </>
      )}
      <div className="card" id="bosses">
        <p className="font-black">👾 {t("Error bosses")}</p>
        <p className="mb-2 text-sm text-muted">{t("A mistake you repeat becomes a boss. Each time you use the right form on your own, it loses health.")}</p>
        {!bs.length && <p className="text-sm">{t("No bosses right now. Nice.")}</p>}
        {bs.map((b) => <p key={b.id} dir="ltr" className="mb-1 text-sm">{"❤️".repeat(b.hp)} <span className="line-through">{b.wrong}</span> → <b>{b.fix}</b></p>)}
      </div>
      <div className="card"><p className="mb-2 font-black">🏅 {t("Badges")}</p>{!badges.length && <p className="text-sm text-muted">—</p>}{badges.map((b) => <p key={b.id} className="text-sm"><b>{t(BADGES[b.id]?.[0] ?? b.id)}</b> · {b.day}</p>)}</div>
      {p?.themes && (
        <div className="card">
          <p className="mb-2 font-black">🗂 {t("Themes waiting for you")}</p>
          {MODES.map((m) => <div key={m.id} className="mb-3 text-sm"><p className="font-bold">{m.emoji} {u.ui_lang === "ar" ? m.nameAr : m.name}</p><p className="text-muted">{(p.themes[m.id] ?? []).join(" · ")}</p></div>)}
        </div>
      )}
    </>
  );
}
