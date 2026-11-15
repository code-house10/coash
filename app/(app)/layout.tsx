import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { makeT } from "@/lib/t";

const NAV = [["/", "🏠", "Home"], ["/community", "💬", "Community"], ["/reports", "📄", "Reports"], ["/plan", "🧭", "Plan"], ["/settings", "⚙️", "Settings"]];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await pageUser(false);
  const t = makeT(u.ui_lang);
  return (
    <>
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-4 pb-28">{children}</main>
      {u.level && (
        <nav className="fixed inset-x-0 bottom-3 z-30 mx-auto flex w-[min(92%,26rem)] justify-between rounded-full border border-line bg-card p-1.5 shadow-lg">
          {NAV.map(([href, icon, label]) => (
            <Link key={href} href={href} aria-label={t(label)} title={t(label)} className="flex h-11 flex-1 items-center justify-center rounded-full text-xl hover:bg-bg">{icon}</Link>
          ))}
        </nav>
      )}
    </>
  );
}
