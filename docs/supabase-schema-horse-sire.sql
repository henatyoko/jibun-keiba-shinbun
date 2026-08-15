-- 馬の父馬名(血統)キャッシュ。父は不変のデータなので一度取得したら再取得不要。
create table if not exists public.horse_sires (
  horse_id text primary key,
  sire text not null,
  fetched_at timestamptz not null default now()
);

alter table public.horse_sires enable row level security;
create policy "horse_sires_select_all" on public.horse_sires
  for select using (true);
