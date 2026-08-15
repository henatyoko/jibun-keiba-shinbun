-- 馬ごとの調教師・馬主キャッシュ(基本的に不変のデータなので一度取得したら再取得しない)
create table if not exists public.horse_profiles (
  horse_id text primary key,
  trainer text,
  owner text,
  fetched_at timestamptz not null default now()
);

alter table public.horse_profiles enable row level security;
create policy "horse_profiles_select_all" on public.horse_profiles
  for select using (true);
