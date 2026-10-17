# BetterHealth

Train every muscle, log what you eat, and get a coach that reads your day.

- **Train**: tap a body map (16 muscle groups, front and back) to see moves, build a workout and log sets.
- **Food**: type "2 eggs and a banana". A built-in table of 150 foods answers instantly; anything else can go to OpenAI, with results cached in Supabase.
- **Today**: calorie ring, macros and micronutrients against your Mifflin-St Jeor targets.
- **Coach**: reads your day and says what to do next (OpenAI when signed in, rule-based otherwise).

Design notes and the planning prompt are in [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md).

## Run it

```bash
npm install
npm run dev
```

With no env vars the app runs in **demo mode**: data lives in the browser and AI is off.

## Environment

Copy `.env.example` to `.env.local`.

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Accounts and cloud sync |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Shared food cache and AI usage caps. AI stays off without it |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | server only | AI food estimates, coach, workout builder |
| `AI_DISABLED`, `AI_GLOBAL_DAILY_LIMIT` | server only | Kill switch and a daily cap across all users (default 500) |

The schema is in `supabase/migrations/0001_init.sql`. Every table has row-level security. In Supabase, add your site URL and `https://<your-app>.vercel.app/auth/callback` under Authentication, URL configuration so sign-in links work.

## Test

```bash
npm test
```
