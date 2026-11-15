import * as webpush from "web-push";
import { all, run } from "@/lib/db";
import { today } from "@/lib/game";
import { APP } from "@/lib/shared";

/** Call hourly from any scheduler with ?key=CRON_SECRET. Nudges users whose reminder hour is now and who have not practised today. */
export async function GET(req: Request) {
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, CRON_SECRET } = process.env;
  if (!CRON_SECRET || new URL(req.url).searchParams.get("key") !== CRON_SECRET) return new Response("no", { status: 401 });
  if (!pub || !priv) return Response.json({ error: "VAPID keys not set" }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  let sent = 0;
  for (const r of all("SELECT p.endpoint, p.sub, u.timezone, u.reminder, u.last_day FROM pushes p JOIN users u ON u.id=p.user_id")) {
    const hour = new Intl.DateTimeFormat("en-GB", { timeZone: r.timezone, hour: "2-digit", hour12: false }).format(new Date());
    if (hour !== r.reminder.slice(0, 2) || r.last_day === today(r.timezone)) continue;
    try { await webpush.sendNotification(JSON.parse(r.sub), JSON.stringify({ title: APP, body: "Time to talk. A few minutes is enough.", url: "/" })); sent++; }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) run("DELETE FROM pushes WHERE endpoint=?", r.endpoint); }
  }
  return Response.json({ sent });
}
