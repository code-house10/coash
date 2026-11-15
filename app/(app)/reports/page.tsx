import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { all, J } from "@/lib/db";
import { makeT } from "@/lib/t";

export default async function Reports() {
  const u = await pageUser();
  const t = makeT(u.ui_lang);
  const rows = (await all("SELECT id, day, data FROM reports WHERE user_id=? ORDER BY id DESC", u.id)).map((r) => ({ ...r, d: J(r.data, {} as any) }));
  const avg = (s: Record<string, number>) => Math.round(Object.values(s ?? {}).reduce((a, b) => a + (Number(b) || 0), 0) / Math.max(1, Object.keys(s ?? {}).length));
  return (
    <>
      <div><h1 className="text-2xl font-black">{t("Reports")}</h1><p className="text-muted">{t("Every session you have done, newest first.")}</p></div>
      {!rows.length && <p className="card text-muted">{t("No reports yet. Finish a session and the first one appears here.")}</p>}
      {rows.map((r) => (
        <Link key={r.id} href={`/reports/${r.id}`} className="card">
          <p className="font-black">{r.day} · {r.d.mode?.emoji} {u.ui_lang === "ar" ? r.d.mode?.nameAr : r.d.mode?.name}</p>
          <p className="text-sm text-muted">{t("Average")} {avg(r.d.scores)} · +{r.d.xp} XP · {r.d.minutes} {t("min")}</p>
        </Link>
      ))}
    </>
  );
}
