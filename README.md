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

## Deploy on Vercel

1. Create a free database at https://turso.tech and copy its URL (`libsql://...`) and an auth token.
2. In the Vercel project → Settings → Environment Variables, add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GEMINI_API_KEY`, `SETUP_CODE`.
3. Redeploy. Tables are created automatically on the first request.

Any other Node 22+ host works the same way; with a persistent disk you can skip Turso and keep the local file.

## Map

| Path | What |
|---|---|
| `lib/voice.ts` | Browser voice engine: mic → Gemini Live → speaker, backup path (STT + text + browser TTS) |
| `lib/game.ts` | Coach prompt, session picker, report grading, XP / streak / bosses / badges, weekly plan |
| `lib/ai.ts` | Gemini text/JSON, live token, STT and chat (Groq if `GROQ_API_KEY`, else Gemini) |
| `lib/db.ts`, `lib/auth.ts` | libSQL (local file or Turso) schema, sessions, password hashing, API wrapper |
| `lib/ar.ts` | Arabic UI strings |
| `app/api/*` | See `../ANALYSIS.md` §3 — same endpoints and shapes |

## Known limits

- PDF is the browser print dialog ("Save as PDF").
- Echo is left to the browser's echo cancellation; use headphones on loud speakers.
- Push reminders need VAPID keys and an hourly call to `/api/cron/remind?key=CRON_SECRET`.
