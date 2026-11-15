"use client";
import { useEffect, useState } from "react";
import { post } from "@/lib/i18n";
import { PLANS } from "@/lib/shared";

export function Admin() {
  const [d, setD] = useState<any>({ users: [], codes: [], events: [] });
  const [note, setNote] = useState("");
  const load = () => post("/api/admin", { action: "list" }).then(setD).catch((e) => setNote(e.message));
  const act = (body: object) => post("/api/admin", body).then((r) => { if (r.code) setNote(`Code: ${r.code}`); return load(); }).catch((e) => setNote(e.message));
  useEffect(() => { void load(); }, []);

  return (
    <>
      <h1 className="text-2xl font-black">🛠 Admin</h1>
      {note && <p className="card font-bold">{note}</p>}
      <div className="card flex flex-col gap-2">
        <p className="font-black">Invites</p>
        <button className="btn grad" onClick={() => act({ action: "invite" })}>New invite code</button>
        {d.codes.map((c: any) => (
          <p key={c.code} className="break-all text-sm"><b>{c.kind}</b> {c.email ?? ""} · <code>{c.kind === "invite" ? `${location.origin}/login?invite=${c.code}` : c.code}</code></p>
        ))}
      </div>
      <div className="card flex flex-col gap-3">
        <p className="font-black">Users · {d.users.length}</p>
        {d.users.map((u: any) => (
          <form key={u.id} className="border-b border-line pb-3 text-sm" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void act({ action: "plan", id: u.id, plan: f.get("plan"), until: f.get("until") }); }}>
            <p className="font-bold">{u.name || "—"} · {u.email}</p>
            <p className="text-muted">{u.level ?? "no level"} · {u.xp} XP · 🔥 {u.streak} · last {u.last_day ?? "never"}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <select name="plan" defaultValue={u.plan} className="input !w-auto">{Object.entries(PLANS).map(([id, p]) => <option key={id} value={id}>{p.name} ({p.minutes} min)</option>)}</select>
              <input name="until" type="date" defaultValue={u.access_until ?? ""} className="input !w-auto" required />
              <button className="btn ghost !py-1">Save</button>
              <button type="button" className="btn ghost !py-1" onClick={() => act({ action: "reset", email: u.email })}>Reset code</button>
            </div>
          </form>
        ))}
      </div>
      <div className="card text-xs">
        <p className="mb-1 text-base font-black">Voice service events</p>
        {!d.events.length && <p className="text-muted">None.</p>}
        {d.events.map((e: any, i: number) => <p key={i}>{e.created} · {e.provider}/{e.type} · {e.reason}</p>)}
      </div>
    </>
  );
}
