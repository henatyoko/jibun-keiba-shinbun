-- 調教タイム系テーブル(坂路・ウッドチップ)もRLSが有効なままポリシーが無く、
-- anonキー経由からは読めない状態だった。他のJV-Data系テーブルと同様、
-- 公開情報なので誰でもSELECTできるようにする。
create policy "hanro_chokyo_select_all" on public.hanro_chokyo
  for select using (true);

create policy "woodchip_chokyo_select_all" on public.woodchip_chokyo
  for select using (true);
