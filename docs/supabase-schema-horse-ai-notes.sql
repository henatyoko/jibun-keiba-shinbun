-- 馬ごとのAI一言コメント・スコア補正キャッシュ(Claude Haikuで生成、3日キャッシュ)
create table if not exists public.horse_ai_notes (
  horse_id text primary key,
  comment text not null,
  score_adjustment integer not null default 0,
  fetched_at timestamptz not null default now()
);

alter table public.horse_ai_notes enable row level security;
create policy "horse_ai_notes_select_all" on public.horse_ai_notes
  for select using (true);
