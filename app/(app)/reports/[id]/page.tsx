import Link from "next/link";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { get, J } from "@/lib/db";
import { makeT } from "@/lib/t";
import { BADGES } from "@/lib/shared";
import { PrintButton } from "@/components/PrintButton";

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const u = await pageUser();
  const t = makeT(u.ui_lang);
  const row = get("SELECT * FROM reports WHERE id=? AND user_id=?", Number((await params).id), u.id);
  if (!row) notFound();
  const d = J(row.data, {} as any);
  const list = (title: string, items?: string[]) => !!items?.length && (
    <div className="card"><p className="mb-2 font-black">{title}</p><ul className="list-disc space-y-1 ps-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  );
  return (
    <>
      <div><h1 className="text-2xl font-black">{t("Session report")}</h1><p className="text-muted">{row.day} · {d.mode?.emoji} {u.ui_lang === "ar" ? d.mode?.nameAr : d.mode?.name}</p></div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[[`+${d.xp}`, "XP earned"], [`🔥 ${d.streak}`, "day streak"], [`${d.spoke}%`, "you spoke"], [d.minutes, "minutes"]].map(([v, l]) => (
          <div key={l} className="card !p-2"><p className="text-xl font-black">{v}</p><p className="text-[11px] text-muted">{t(l)}</p></div>
        ))}
      </div>
      <div className="card text-sm">{(d.xpLines ?? []).map(([l, n]: [string, number]) => <p key={l} className="flex justify-between"><span>{l}</span><b>+{n}</b></p>)}</div>
      {!!d.badges?.length && <div className="card"><p className="mb-1 font-black">🏅 {t("Badges unlocked")}</p>{d.badges.map((b: string) => <p key={b} className="text-sm"><b>{t(BADGES[b]?.[0])}</b> — {t(BADGES[b]?.[1])}</p>)}</div>}
      <p className="card text-sm">{d.summary}</p>
      <div className="card">
        <p className="mb-2 font-black">{t("Scores out of 100")}</p>
        {Object.entries(d.scores ?? {}).map(([k, v]) => (
          <div key={k} className="mb-2 text-sm"><div className="flex justify-between"><span>{t(k[0].toUpperCase() + k.slice(1))}</span><b>{String(v)}</b></div><div className="h-2 rounded-full bg-bg"><div className="grad h-2 rounded-full" style={{ width: `${v}%` }} /></div></div>
        ))}
      </div>
      {!!d.mistakes?.length && (
        <div className="card">
          <p className="font-black">{t("Mistakes")}</p><p className="mb-2 text-sm text-muted">{t("Try to fix each one in your head, then tap to check.")}</p>
          {d.mistakes.map((m: any, i: number) => (
            <details key={i} className="mb-2 rounded-xl border border-line p-3 text-sm" dir="ltr">
              <summary className="cursor-pointer"><span className="chip !py-0.5 text-[11px]">{m.isNew ? "✨ New" : "👾 Again"} · {m.type}</span> <span className="font-bold">{m.wrong}</span></summary>
              <p className="mt-2 font-bold text-green-600">✓ {m.fix}</p><p className="text-muted" dir="auto">{m.why}</p>
            </details>
          ))}
        </div>
      )}
      {list(`💪 ${t("Strengths shown today")}`, d.strengths)}
      {list(`🧩 ${t("Weak points")}`, d.weak)}
      {list(`🧗 ${t("Challenges you faced")}`, d.challenges)}
      {list(`✅ ${t("Three things to improve")}`, d.improve)}
      {d.tomorrow && <div className="card"><p className="font-black">🔭 {t("Tomorrow's focus")}</p><p className="font-bold">{d.tomorrow.title}</p><p className="text-sm text-muted">{d.tomorrow.why}</p></div>}
      <div className="card text-sm">
        <p className="mb-1 font-black">{t("Session facts")}</p>
        <p>{t("Length (actual / planned)")}: {d.minutes} / {d.planned} {t("min")}</p>
        <p>{t("Your speaking time")}: {Math.round((d.speakingSeconds ?? 0) / 60)} {t("min")}</p>
        <p>{t("Theme")}: {d.theme}</p>
        <p>{t("Voice provider")}: {d.provider === "gemini" ? "Gemini Live" : t("Backup voice")}</p>
      </div>
      <PrintButton label={`⬇ ${t("Download PDF")}`} />
      <Link href="/" className="btn grad no-print text-center">{t("Back to home")}</Link>
    </>
  );
}
