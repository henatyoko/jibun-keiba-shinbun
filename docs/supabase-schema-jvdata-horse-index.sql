-- umagoto_race_johoには(race_code, ketto_toroku_bango)の複合PKしか無く、
-- 馬ID(ketto_toroku_bango)で先に絞り込む検索(各馬の過去走取得など)では
-- このインデックスが使えず、全表スキャンになっていた。これがアプリの
-- 主要なクエリを遅くしている根本原因だったため、専用インデックスを追加する。
create index if not exists umagoto_race_joho_horse_idx
  on public.umagoto_race_joho (ketto_toroku_bango, race_code desc);
