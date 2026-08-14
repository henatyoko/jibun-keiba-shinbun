-- じぶん競馬新聞: 知見ルール テーブル定義
-- Supabaseダッシュボードの SQL Editor にこの内容を貼り付けて実行してください。

-- 属性ルール(馬・血統・騎手・厩舎に紐づく評価)
create table if not exists public.attr_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,       -- 血統 / 騎手 / 厩舎
  value text not null,      -- 例: キズナ, M.タカハシ
  score integer not null,
  created_at timestamptz not null default now()
);

-- 傾向ルール(特定レース・条件そのものに紐づく法則)
create table if not exists public.trend_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  race text not null,       -- 対象レース名
  type text not null,       -- 馬齢 / 枠番 / 脚質
  value text not null,      -- 例: 3歳, 8枠以降
  score integer not null,
  label text not null,      -- 例: 3歳馬は来ない
  created_at timestamptz not null default now()
);

-- Row Level Security: 自分のルールしか読み書きできないようにする
alter table public.attr_rules enable row level security;
alter table public.trend_rules enable row level security;

create policy "attr_rules_select_own" on public.attr_rules
  for select using (auth.uid() = user_id);
create policy "attr_rules_insert_own" on public.attr_rules
  for insert with check (auth.uid() = user_id);
create policy "attr_rules_update_own" on public.attr_rules
  for update using (auth.uid() = user_id);
create policy "attr_rules_delete_own" on public.attr_rules
  for delete using (auth.uid() = user_id);

create policy "trend_rules_select_own" on public.trend_rules
  for select using (auth.uid() = user_id);
create policy "trend_rules_insert_own" on public.trend_rules
  for insert with check (auth.uid() = user_id);
create policy "trend_rules_update_own" on public.trend_rules
  for update using (auth.uid() = user_id);
create policy "trend_rules_delete_own" on public.trend_rules
  for delete using (auth.uid() = user_id);
