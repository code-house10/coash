import type { Metadata, Viewport } from "next";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { LangProvider } from "@/lib/i18n";
import { APP } from "@/lib/shared";

export const metadata: Metadata = { title: APP, description: "Daily spoken English practice", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  const lang = u?.ui_lang ?? "en";
  const th = u?.theme ?? { mode: "auto", brand: "#7c4dff", accent: "#ec4899" };
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-mode={th.mode} style={{ "--brand": th.brand, "--accent": th.accent } as React.CSSProperties}>
      <body className="min-h-dvh antialiased">
        <LangProvider lang={lang}>{children}</LangProvider>
        <script dangerouslySetInnerHTML={{ __html: `if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")` }} />
      </body>
    </html>
  );
}
