import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { minutes } from "@/lib/game";
import { makeT } from "@/lib/t";
import { PLANS } from "@/lib/shared";
import { Settings } from "@/components/Settings";

export default async function SettingsPage() {
  const u = await pageUser();
  const t = makeT(u.ui_lang);
  const m = minutes(u);
  return (
    <>
      <h1 className="text-2xl font-black">{t("Settings")}</h1>
      <div className="card">
        <p className="font-black">💳 {t("Your plan")}: {t(PLANS[u.plan]?.name ?? u.plan)}</p>
        <p className="text-sm text-muted">{t("Access until")} {u.access_until ?? "—"} · {t("Coach minutes today")} {m.used} / {m.limit}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {Object.entries(PLANS).map(([id, p]) => (
            <div key={id} className={`rounded-xl border p-2 ${id === u.plan ? "border-brand" : "border-line"}`}><b>{t(p.name)}</b><p className="text-muted">{t("{n} coach minutes a day", { n: p.minutes })}</p></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t("To change plan or renew, contact the person who invited you.")}</p>
      </div>
      <Settings user={{ name: u.name, email: u.email, profile: u.profile, theme: u.theme, voice: u.voice, uiLang: u.ui_lang, reportLang: u.report_lang, minutesPref: u.minutes_pref, reminder: u.reminder }} pushKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
      {!!u.is_admin && <Link href="/admin" className="btn ghost text-center">🛠 {t("Admin")}</Link>}
    </>
  );
}
