-- BetterHealth initial schema. RLS on everything.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('breakfast','lunch','dinner','snack')),
  name text not null check (char_length(name) <= 200),
  portion text not null default '',
  grams numeric not null default 0 check (grams >= 0 and grams <= 20000),
  source text not null default 'table' check (source in ('table','ai','manual')),
  nutrients jsonb not null,
  created_at timestamptz not null default now()
);
create index food_logs_user_day on public.food_logs (user_id, day desc);

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  title text not null default 'Workout' check (char_length(title) <= 120),
  entries jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index workout_logs_user_day on public.workout_logs (user_id, day desc);

-- Shared cache of AI food estimates. Holds normalized food text only, never user data.
create table public.food_cache (
  query_key text primary key,
  result jsonb not null,
  model text,
  hits int not null default 0,
  created_at timestamptz not null default now()
);

-- Per-user AI usage counters (service role only).
create table public.ai_usage (
  user_id uuid not null,
  feature text not null,
  day date not null,
  count int not null default 0,
  primary key (user_id, feature, day)
);

create or replace function public.bump_ai_usage(p_user uuid, p_feature text, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare c int;
begin
  insert into public.ai_usage (user_id, feature, day, count)
  values (p_user, p_feature, current_date, 1)
  on conflict (user_id, feature, day) do update set count = ai_usage.count + 1
  returning count into c;
  return c <= p_max;
end $$;
revoke all on function public.bump_ai_usage(uuid, text, int) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, text, int) to service_role;

alter table public.profiles enable row level security;
alter table public.food_logs enable row level security;
alter table public.workout_logs enable row level security;
alter table public.food_cache enable row level security;
alter table public.ai_usage enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own food" on public.food_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own workouts" on public.workout_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- food_cache and ai_usage: no client policies. The service role bypasses RLS.
