import { api } from "@/lib/auth";
import { APP } from "@/lib/shared";

/** A daily calendar event at the user's reminder time, linking back to the app. */
export const GET = api(async (u, req) => {
  const [h, m] = u.reminder.split(":");
  const url = new URL(req.url).origin;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${APP}//EN`, "BEGIN:VEVENT", `UID:daily-${u.id}@${new URL(url).host}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`, `DTSTART;TZID=${u.timezone}:20250101T${h}${m}00`, "DURATION:PT15M", "RRULE:FREQ=DAILY",
    `SUMMARY:${APP}: time to talk`, `URL:${url}`, `DESCRIPTION:${url}`, "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:Time to talk", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar", "Content-Disposition": 'attachment; filename="daily-practice.ics"' } });
});
