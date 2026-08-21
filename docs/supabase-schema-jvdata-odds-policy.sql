-- JvLink To Importerが作成したオッズ系テーブル(O1: 単複枠オッズ)もRLSが有効なまま
-- ポリシーが無く、anonキー経由からは読めない状態だった。他のJV-Data系テーブルと同様、
-- 公開情報なので誰でもSELECTできるようにする。
create policy "odds1_select_all" on public.odds1
  for select using (true);

create policy "odds1_tansho_select_all" on public.odds1_tansho
  for select using (true);

create policy "odds1_fukusho_select_all" on public.odds1_fukusho
  for select using (true);

create policy "odds1_wakuren_select_all" on public.odds1_wakuren
  for select using (true);
