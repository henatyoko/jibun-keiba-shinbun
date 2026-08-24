-- hanro_chokyo/woodchip_chokyoのPKは(tracen_kubun, chokyo_nengappi, chokyo_jikoku,
-- ketto_toroku_bango)の順で、馬ID(ketto_toroku_bango)が末尾のため馬ID検索には
-- 使えていなかった。umagoto_race_johoと同じ理由でインデックスを追加する。
create index if not exists hanro_chokyo_horse_idx
  on public.hanro_chokyo (ketto_toroku_bango, chokyo_nengappi desc);

create index if not exists woodchip_chokyo_horse_idx
  on public.woodchip_chokyo (ketto_toroku_bango, chokyo_nengappi desc);
