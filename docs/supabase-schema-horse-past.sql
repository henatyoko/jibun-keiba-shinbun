-- 出走馬にnetkeibaの馬IDを追加(過去成績取得のキーとして使う)
alter table public.race_entries add column if not exists horse_id text;

-- 馬ごとの過去成績キャッシュ(レース詳細を開いた時にオンデマンドで取得・保存)
create table if not exists public.horse_past_races (
  id uuid primary key default gen_random_uuid(),
  horse_id text not null,
  race_date date not null,
  place text,
  distance text,
  finish_position integer,
  headcount integer,
  race_name text,
  fetched_at timestamptz not null default now(),
  unique (horse_id, race_date, race_name)
);

alter table public.horse_past_races enable row level security;
create policy "horse_past_races_select_all" on public.horse_past_races
  for select using (true);
