-- JvLink To ImporterがPostgres直接接続で作成したJV-Data系テーブルは
-- RLSが有効なままポリシーが無く、anonキー経由(アプリのSupabaseクライアント)からは
-- 何も読めない状態だった。競馬データは公開情報なので誰でもSELECTできるようにする。
create policy "race_shosai_select_all" on public.race_shosai
  for select using (true);

create policy "umagoto_race_joho_select_all" on public.umagoto_race_joho
  for select using (true);

create policy "kyosoba_master2_select_all" on public.kyosoba_master2
  for select using (true);

create policy "kishu_master_select_all" on public.kishu_master
  for select using (true);

create policy "chokyoshi_master_select_all" on public.chokyoshi_master
  for select using (true);

create policy "banushi_master_select_all" on public.banushi_master
  for select using (true);
