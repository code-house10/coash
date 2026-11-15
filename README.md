# Fasih — daily spoken-English coach

Voice practice with an AI partner (Gemini Live), a report after every session, a personal plan, levels A1→C2, error bosses, level chat rooms. English/Arabic UI. Installable PWA.

## Run

```bash
cp .env.example .env.local   # then fill GEMINI_API_KEY and SETUP_CODE
npm install
npm run dev                  # http://localhost:3000
```

1. Open the app → the first account signs up with `SETUP_CODE` and becomes the admin.
2. Settings → Admin → "New invite code" → send the invite link to each learner.
3. Renewals and plan changes are set per user on the Admin page.

Production: `npm run build && npm start` on any Node 22+ host **with a persistent disk** (the database is the SQLite file `data/app.db`). Microphone access needs HTTPS.

## Map

| Path | What |
|---|---|
| `lib/voice.ts` | Browser voice engine: mic → Gemini Live → speaker, backup path (STT + text + browser TTS) |
| `lib/game.ts` | Coach prompt, session picker, report grading, XP / streak / bosses / badges, weekly plan |
| `lib/ai.ts` | Gemini text/JSON, live token, STT and chat (Groq if `GROQ_API_KEY`, else Gemini) |
| `lib/db.ts`, `lib/auth.ts` | SQLite schema, sessions, password hashing, API wrapper |
| `lib/ar.ts` | Arabic UI strings |
| `app/api/*` | See `../ANALYSIS.md` §3 — same endpoints and shapes |

## Known limits

- SQLite file: not for serverless hosts (Vercel). Swap `lib/db.ts` for Postgres/Turso there.
- PDF is the browser print dialog ("Save as PDF").
- Echo is left to the browser's echo cancellation; use headphones on loud speakers.
- Push reminders need VAPID keys and an hourly call to `/api/cron/remind?key=CRON_SECRET`.
