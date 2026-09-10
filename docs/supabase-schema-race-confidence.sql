-- 自分の予想に対する「自信あり」フラグ(レース単位)。
-- パドック評価と同様、ログイン中ユーザー自身の当日メモなので専用テーブルにする。
-- race_snapshots同様、race_codeは(旧netkeibaスクレイパー時代の)races(id)には
-- 依存させず、JV-Dataのrace_codeをそのままテキストで持つ。
create table if not exists public.race_confidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  race_id text not null,
  confident boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, race_id)
);

alter table public.race_confidence enable row level security;

create policy "race_confidence_select_own" on public.race_confidence
  for select using (auth.uid() = user_id);
create policy "race_confidence_insert_own" on public.race_confidence
  for insert with check (auth.uid() = user_id);
create policy "race_confidence_update_own" on public.race_confidence
  for update using (auth.uid() = user_id);
create policy "race_confidence_delete_own" on public.race_confidence
  for delete using (auth.uid() = user_id);
