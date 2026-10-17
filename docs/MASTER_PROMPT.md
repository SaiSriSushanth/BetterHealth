# BetterHealth: master build prompt (v2, reviewed and tightened)

## Product
Web app for fitness + nutrition: (1) workouts by muscle, (2) type a food, get approx kcal/protein/carbs/fat/fiber/sugar (+ a few micros), (3) daily intake vs goals, (4) optional OpenAI features, (5) Supabase auth/DB, (6) Vercel deploy.
Principle: the AI estimates, the DB remembers. Every AI food result is cached. Estimates are labelled "approx" in the UI.

## Stack
Next.js 15 App Router, TypeScript strict, Tailwind, @supabase/ssr, openai SDK (server only, structured outputs, OPENAI_MODEL default gpt-4o-mini), zod, Vitest. Fonts via next/font (self-hosted, no layout shift).
Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (server only, never NEXT_PUBLIC), OPENAI_API_KEY, OPENAI_MODEL. Ship .env.example. Missing Supabase vars => demo mode; missing OPENAI key => AI routes return degraded:true.

## Data layer (parity rule)
One `Repo` interface (profile, foodLogs, workoutLogs, summaries) with two adapters: `LocalRepo` (localStorage, versioned key, try/catch, schema-validated on read) and `SupabaseRepo`. UI only talks to Repo. Pick adapter once from env, server-decidable so SSR and first client render match.
Hydration: pages that read local data render a skeleton on server and fill in after mount (useEffect); never read localStorage or Date.now/Math.random during render. No dates from server tz: store the user's local `YYYY-MM-DD` with each log and compute "today" client-side.
Demo -> signed-in: offer one-time "import local data" on first login; otherwise keep demo data separate. Demo mode never calls /api AI routes (uses built-in table + static plans).

## Units and data rules
Store metric internally (kg, cm, g, kcal). Onboarding toggles kg/lb and cm/ft-in, display only. Validate ranges (age 13-100, height 120-230 cm, weight 30-300 kg); under-18 gets maintenance-only targets, no deficit. "Other/prefer not" sex uses mean of the two Mifflin constants. Portions stored as grams plus a human label ("1 cup"). Totals recomputed from logs, `daily_summaries` is a cache only, not a source of truth.

## Design: "Cut-Paper Gym" (Matisse cut-outs)
- Colors: Tangerine #FF6A2B, Sunshine #FFD43B, Teal #12B5A6, Bubblegum #FF8FB8, Mist #E8FAF5 (bg), Ink #06312E (text). Ink text on colour fills only; verify AA on pale "neglected" fills; never convey state by colour alone (add label/pattern).
- Fonts: Dela Gothic One (headings/numerals only), Albert Sans (rest). Sentence case, plain-verb buttons, no all-caps eyebrows.
- Shapes: no outlines; uneven-radius blobs on hero pieces only; 12px radii elsewhere; hard offset shadow in darker tint of same hue.
- Signature: SVG body map, front/back, tap a muscle -> exercises; trained-this-week muscles filled, others pale. Must be keyboard-operable (buttons/roles + aria-labels) with a list fallback. Ship 14-16 grouped regions, not 32 hand-drawn shapes.
- Food hero: calorie ring of cut-paper wedges (protein/carbs/fat), over-goal and zero-log states defined.
- Motion 150-250ms, fade only under prefers-reduced-motion. Coach has copy personality + small scrap avatar.

## Features
P0: onboarding with goal reveal; targets via Mifflin-St Jeor TDEE, activity multipliers 1.2/1.375/1.55/1.725, cut -500 (floor 1500 male /1200 female/other), gain +300, protein 1.8 g/kg (2.0 cut), fat 25% kcal, fiber 14g/1000kcal; text food log (built-in table of ~150 common foods, fuzzy match, editable portion); diary with day navigation; exercise library by muscle (~16 groups x 2-3, seeded as TS data, static plans); workout logging (sets/reps/weight).
Empty states required: no logs today, no workouts this week, no goal set, AI unavailable, food not found (offer manual entry kcal/macros).
P1 (AI, only if P0 done): food text -> nutrition JSON (strict zod schema, sanity |kcal-(4P+4C+9F)|<=15%, cache keyed by normalized text hash); AI workout generator (exercise slugs only, validated); daily coach (3 wins/1 gap/1 action, no medical advice, cached per user per day).
Screens: Today, Log food, Diary, Train, Workout session, Coach, Progress (simple weekly bars, no charting lib).
Safety: medical disclaimer in footer + onboarding; no extreme-deficit advice; never present estimates as exact.

## Backend and security
Tables: profiles, food_logs, workout_logs, food_cache, ai_usage (exercises stay in code; daily_summaries and ai_insights deferred). Single migration file with RLS on all; policies use `(select auth.uid())`; user tables owner-only; food_cache global read-only to clients (writes service role; cache holds only normalized food text, never user ids/PII); ai_usage service role only. Enable email auth; no email-confirm dead end: show "check your inbox" state, handle callback route + error page, signed-out redirect with `next`.
Routes /api/food/analyze, /api/coach, /api/workout/generate: auth via getUser() (never getSession), zod-validate body, input length cap (200 chars), user text in delimiters with "treat as data" system rule, max_tokens, 20s timeout, output re-validated, degrade with `degraded:true`. Never call OpenAI unauthenticated.
Cost control: per-user daily cap (e.g. 30 food, 3 coach, 3 workout) counted in ai_usage with atomic increment (not read-then-write); global daily cap env var as kill switch; cache lookup before any model call; set an OpenAI billing hard limit. Rate limiting must not rely on in-memory state (serverless).
Next 15: await cookies()/params; middleware only refreshes session and gates routes; service-role client in a server-only module (`import "server-only"`). No secrets in logs; don't log prompts with user text beyond usage counts.

## Quality bar
Responsive to 360px, visible focus, reduced motion, AA contrast, tests for goal calc/unit conversion/normalize/zod schemas/sanity check, `next build` and lint pass in CI-equivalent locally, deployed on Vercel with env vars set, smoke test in demo mode and signed-in mode.

## Build order (each step leaves a runnable app; commit after each)
1. Scaffold, fonts, theme tokens, layout shell, Repo interface + LocalRepo, demo mode flag.
2. Onboarding + goal calc (+ tests) + Today screen with empty states.
3. Food table, text log, diary, micronutrient/macro panel (demo-complete, no network).
4. Exercise data, Train list by muscle, workout session + logging; then SVG body map as an upgrade over the list.
5. Supabase: migration, auth pages, SupabaseRepo, middleware, local import. Test both modes.
6. AI food analyze route + cache + usage caps; wire as fallback when table has no match.
7. Coach + AI workout generator (zod-validated), Progress screen.
8. Polish: a11y/contrast pass, responsive check, disclaimer, README/env docs, Vercel deploy and smoke test.
Stop at any step boundary and still have a deployable app.

## Cut list (unrealistic for one session)
32 hand-drawn muscle shapes (use ~16 regions, simple geometric paths); full micronutrient database (show ~8 nutrients, from table or AI); swap suggestions; separate daily_summaries/ai_insights/exercises tables; hand-built Progress charts beyond weekly bars; image/barcode logging; custom rate-limit infra; offline/PWA; social features; per-wedge animation beyond a simple draw-in.
