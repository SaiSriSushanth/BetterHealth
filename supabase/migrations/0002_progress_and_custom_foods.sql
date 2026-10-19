-- Weight history, saved foods and meals, and more food sources.

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kg numeric not null check (kg >= 20 and kg <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index weight_logs_user_day on public.weight_logs (user_id, day desc);

create table public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  portion text not null default '',
  grams numeric not null default 0 check (grams >= 0 and grams <= 20000),
  nutrients jsonb not null,
  favorite boolean not null default false,
  kind text not null default 'food' check (kind in ('food','meal')),
  items jsonb,
  created_at timestamptz not null default now()
);
create index custom_foods_user on public.custom_foods (user_id, created_at);

alter table public.weight_logs enable row level security;
alter table public.custom_foods enable row level security;

create policy "own weights" on public.weight_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own custom foods" on public.custom_foods for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Barcode, photo and saved-food entries in the diary.
alter table public.food_logs drop constraint if exists food_logs_source_check;
alter table public.food_logs add constraint food_logs_source_check
  check (source in ('table','ai','manual','custom','barcode','photo'));
