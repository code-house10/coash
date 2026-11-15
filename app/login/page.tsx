"use client";
import { useEffect, useState } from "react";
import { post } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { APP } from "@/lib/shared";

type Mode = "signin" | "signup" | "reset";

export default function Login() {
  const [lang, setLang] = useState("en");
  const [mode, setMode] = useState<Mode>("signin");
  const [hasAccount, setHasAccount] = useState(true);
  const [f, setF] = useState({ email: "", password: "", setupCode: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const t = makeT(lang);

  useEffect(() => {
    const invite = new URLSearchParams(location.search).get("invite");
    if (invite) { setF((x) => ({ ...x, setupCode: invite })); setMode("signup"); }
    const saved = localStorage.getItem("lang");
    if (saved === "ar" || (!saved && navigator.language.startsWith("ar"))) setLang("ar");
    post("/api/auth", { action: "status" }).then((r) => { setHasAccount(r.hasAccount); if (!r.hasAccount) setMode("signup"); }).catch(() => {});
  }, []);
  useEffect(() => { document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; }, [lang]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await post("/api/auth", { action: mode, ...f }); location.assign("/"); }
    catch (e) { setErr(t(e instanceof Error ? e.message : String(e))); setBusy(false); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 p-6">
      <div className="flex justify-center gap-2">
        {[["en", "English"], ["ar", "العربية"]].map(([id, label]) => (
          <button key={id} className="chip" data-on={lang === id} onClick={() => { setLang(id); localStorage.setItem("lang", id); }}>{label}</button>
        ))}
      </div>
      <div className="text-center">
        <div className="grad mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-[2rem] text-4xl font-black">ف</div>
        <p className="text-xs font-black tracking-widest text-brand">{APP.toUpperCase()}</p>
        <h1 className="text-2xl font-black">{t(mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password")}</h1>
        <p className="text-sm text-muted">{t("Ten minutes of talking a day. That is the whole trick.")}</p>
      </div>
      <form onSubmit={submit} className="card flex flex-col gap-3">
        <label className="text-sm font-bold">{t("Email")}<input className="input mt-1" type="email" autoComplete="email" required value={f.email} onChange={set("email")} /></label>
        <label className="text-sm font-bold">{t(mode === "reset" ? "New password" : "Password")}
          <span className="relative mt-1 block">
            <input className="input" type={show ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} value={f.password} onChange={set("password")} />
            <button type="button" className="absolute inset-y-0 end-3 text-sm font-bold text-brand" onClick={() => setShow(!show)}>{t(show ? "Hide" : "Show")}</button>
          </span>
        </label>
        {mode !== "signin" && (
          <label className="text-sm font-bold">{t(mode === "reset" ? "Reset code" : hasAccount ? "Invite code" : "Setup code")}
            <input className="input mt-1" required value={f.setupCode} onChange={set("setupCode")} />
            <span className="text-xs font-normal text-muted">{t(mode === "reset" ? "Ask the person who invited you for a reset code. It works once." : hasAccount ? "The code from your invitation. It works once." : "The private code this app was installed with.")}</span>
          </label>
        )}
        {err && <p className="text-sm font-bold text-red-500">{err}</p>}
        <button className="btn grad" disabled={busy}>{t(mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Set new password")}</button>
      </form>
      <div className="flex flex-col items-center gap-2 text-sm font-bold text-brand">
        {mode !== "signin" && hasAccount && <button onClick={() => setMode("signin")}>{t("Back to sign in")}</button>}
        {mode === "signin" && <button onClick={() => setMode("reset")}>{t("Forgot your password?")}</button>}
        {mode === "signin" && <button onClick={() => setMode("signup")}>{t("Have an invite? Create your account")}</button>}
      </div>
    </main>
  );
}
