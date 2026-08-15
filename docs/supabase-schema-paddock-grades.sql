-- パドック評価(ユーザー自身がその日のパドックを見て入力するA/B/無印)
-- レース・出走馬に紐づく当日限りの評価なので、属性/傾向ルールとは別テーブルにする。
create table if not exists public.paddock_grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  race_id text not null references public.races(id) on delete cascade,
  horse_num integer not null,
  grade text not null check (grade in ('A', 'B', '無印')),
  updated_at timestamptz not null default now(),
  unique (user_id, race_id, horse_num)
);

alter table public.paddock_grades enable row level security;

create policy "paddock_grades_select_own" on public.paddock_grades
  for select using (auth.uid() = user_id);
create policy "paddock_grades_insert_own" on public.paddock_grades
  for insert with check (auth.uid() = user_id);
create policy "paddock_grades_update_own" on public.paddock_grades
  for update using (auth.uid() = user_id);
create policy "paddock_grades_delete_own" on public.paddock_grades
  for delete using (auth.uid() = user_id);
