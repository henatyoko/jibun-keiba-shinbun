-- 母の産駒成績(半兄弟の走り)をketto2_hanshoku_toroku_bango(母の血統登録番号)で
-- kyosoba_master2を絞り込んで検証しようとしたが、ketto1(父)側と同様にインデックスが無く
-- 統計タイムアウトになった。ketto1_hanshoku_toroku_bango用のインデックス
-- (kyosoba_master2_sire_idx)と同じ理由・同じ対処。
create index if not exists kyosoba_master2_dam_idx
  on public.kyosoba_master2 (ketto2_hanshoku_toroku_bango);
