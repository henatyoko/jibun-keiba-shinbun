-- JV-Linkの取込対象に「払戻情報」を追加した後に作成されたharaimodoshiテーブルも
-- 他のJV-Data系テーブルと同様、RLSが有効なままポリシーが無かったため追加する。
create policy "haraimodoshi_select_all" on public.haraimodoshi
  for select using (true);
