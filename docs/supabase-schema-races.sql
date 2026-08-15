-- じぶん競馬新聞: レース・出走馬テーブル定義(netkeibaスクレイパー用)
-- Supabaseダッシュボードの SQL Editor にこの内容を貼り付けて実行してください。

-- レース情報(netkeibaのrace_idをそのまま主キーに使う)
create table if not exists public.races (
  id text primary key,
  name text not null,
  grade text,
  place text not null,
  distance text not null,
  race_date date not null,
  post_time text,
  updated_at timestamptz not null default now()
);

-- 出走馬情報
create table if not exists public.race_entries (
  id uuid primary key default gen_random_uuid(),
  race_id text not null references public.races(id) on delete cascade,
  num integer not null,
  waku integer not null,
  horse_name text not null,
  sire text,
  jockey text not null,
  age integer,
  updated_at timestamptz not null default now(),
  unique (race_id, num)
);

-- Row Level Security: 誰でも閲覧可(公開情報のため)、書き込みはスクレイパー(service_role)のみ
alter table public.races enable row level security;
alter table public.race_entries enable row level security;

create policy "races_select_all" on public.races
  for select using (true);
create policy "race_entries_select_all" on public.race_entries
  for select using (true);
