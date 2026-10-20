-- Reference food composition data (IFCT 2017, USDA FoodData Central) plus foods learned from web lookups.
-- Public data, but only the service role reads it, through search_reference_foods().

create extension if not exists pg_trgm with schema extensions;

create table public.reference_foods (
  id text primary key,                       -- "ifct:A001", "usda_sr:170000", "web:<hash>"
  source text not null check (source in ('ifct','usda_sr','usda_fndds','usda_foundation','web')),
  code text not null,                        -- id inside the source dataset
  name text not null check (char_length(name) between 1 and 200),
  aliases text[] not null default '{}',      -- other names, incl. Hindi/regional names
  region text not null default 'GLOBAL' check (region in ('IN','US','GLOBAL')),
  category text not null default '',
  state text not null default 'unknown' check (state in ('raw','cooked','dish','unknown')),
  per100 jsonb not null,                     -- Nutrients per 100 g, same keys as the app's Nutrients type
  portions jsonb not null default '[]',      -- [{ "label": "1 cup", "grams": 240 }]
  meta jsonb not null default '{}',          -- web rows: { urls, retrieved_at, query }
  search_text text not null default '',      -- filled by trigger, used for trigram search
  created_at timestamptz not null default now()
);
create unique index reference_foods_source_code on public.reference_foods (source, code);
create index reference_foods_search on public.reference_foods using gin (search_text extensions.gin_trgm_ops);

create or replace function public.reference_foods_fill_search()
returns trigger language plpgsql set search_path = public as $$
begin
  new.search_text := lower(new.name || ' ' || array_to_string(new.aliases, ' '));
  return new;
end $$;
create trigger reference_foods_fill before insert or update of name, aliases on public.reference_foods
  for each row execute function public.reference_foods_fill_search();

alter table public.reference_foods enable row level security;
-- No client policies: the service role bypasses RLS.

-- Best matches for a food name. score is 0..~1.2: word similarity over name+aliases, a bonus for an exact
-- name hit and a small bonus when the row's region is in `regions` (so Indian users see IFCT first).
create or replace function public.search_reference_foods(q text, regions text[] default '{}', lim int default 8)
returns table (id text, source text, name text, aliases text[], region text, category text, state text,
               per100 jsonb, portions jsonb, score real)
language sql stable
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = '0.35'
as $$
  select r.id, r.source, r.name, r.aliases, r.region, r.category, r.state, r.per100, r.portions,
    (word_similarity(lower(q), r.search_text)
      + 0.5 * similarity(lower(q), lower(r.name))
      + case when lower(r.name) = lower(q) or lower(q) = any (select lower(a) from unnest(r.aliases) a) then 0.4 else 0 end
      + case when r.region = any (regions) then 0.08 else 0 end)::real as score
  from public.reference_foods r
  where lower(q) <% r.search_text
  order by score desc
  limit greatest(1, least(lim, 25));
$$;
revoke all on function public.search_reference_foods(text, text[], int) from public, anon, authenticated;
grant execute on function public.search_reference_foods(text, text[], int) to service_role;
