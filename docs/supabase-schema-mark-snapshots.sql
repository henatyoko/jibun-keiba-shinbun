-- ロジック変更をしても過去レースの印(◎○▲△穴)・評価内訳が遡って変わらないよう、
-- 各レース×各馬の予想結果を「最初に計算された時点」でスナップショットとして固定する。
-- 以降は同じrace_codeに対してはこのスナップショットを使い、現在のロジックでの
-- 再計算はしない(=的中率の答え合わせが後から変わらない)。
--
-- 表示に必要なデータ(基礎点・加点内訳・近5走・AIコメント)もまとめて持たせることで、
-- 過去レースの表示時に重い再取得・再計算(過去走/調教/血統/AI生成)を丸ごと省略でき、
-- 読み込みも大幅に軽くなる。
create table if not exists public.race_snapshots (
  race_code text not null,
  horse_num integer not null,
  horse_id text,
  mark text,
  total_score numeric not null,
  base_score numeric,
  has_past_data boolean not null default false,
  applied jsonb not null default '[]'::jsonb,
  past_results jsonb,
  ai_note jsonb,
  created_at timestamptz not null default now(),
  primary key (race_code, horse_num)
);

alter table public.race_snapshots enable row level security;

-- 誰でも読める(自分の予想根拠を後から検証するための公開データ)
create policy "race_snapshots_select_all" on public.race_snapshots
  for select using (true);

-- 未ログインでも(最初にそのレースを開いた人が)新規スナップショットを追加できる。
-- 既存行は一意制約(race_code, horse_num)で上書きできない。
create policy "race_snapshots_insert_all" on public.race_snapshots
  for insert with check (true);
