-- fetchPedigreeAptitude(種牡馬・母父ごとの産駒距離適性集計)がketto1_hanshoku_toroku_bango
-- でkyosoba_master2(21万行)を絞り込むが、インデックスが無くフルスキャンになっていた
-- (1種牡馬あたり最大8秒超)。レース1件あたり最大20頭前後の種牡馬/母父を引くため、
-- 特に出走馬が新馬・未勝利中心(自身の距離実績が薄く母父側を頼るケースが多い)のレースで
-- 致命的に重かった。umagoto_race_joho/hanro_chokyoと同種の原因。
create index if not exists kyosoba_master2_sire_idx
  on public.kyosoba_master2 (ketto1_hanshoku_toroku_bango);
