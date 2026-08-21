import { supabase } from "./supabaseClient";
import { classWeight } from "../data/jvCodeTables";

// JV-Data(umagoto_race_joho)から、各馬の「今見ているレースより前」の直近成績を取る。
// 着順・人気・上がり3Fに加え、そのレースの格(未勝利〜G1)による重みも付ける
// (基礎点・AIコメント生成の唯一のソースとして使う)。
export async function fetchJvPastRaces(horseIds, beforeRaceCode) {
  if (!horseIds || horseIds.length === 0 || !beforeRaceCode) return {};

  const { data, error } = await supabase
    .from("umagoto_race_joho")
    .select("ketto_toroku_bango, race_code, kakutei_chakujun, tansho_ninkijun, kohan_3f")
    .in("ketto_toroku_bango", horseIds)
    .lt("race_code", beforeRaceCode)
    .not("kakutei_chakujun", "is", null)
    .neq("kakutei_chakujun", "")
    .order("race_code", { ascending: false });

  if (error || !data) return {};

  const byHorse = {};
  data.forEach((row) => {
    const list = (byHorse[row.ketto_toroku_bango] ||= []);
    if (list.length < 5) list.push(row);
  });

  // 各過去走のレース格(未勝利〜G1)を引くため、対象race_codeの条件情報をまとめて取得する
  const raceCodes = [...new Set(Object.values(byHorse).flat().map((r) => r.race_code))];
  if (raceCodes.length > 0) {
    const { data: raceRows } = await supabase
      .from("race_shosai")
      .select(
        "race_code, grade_code, kyoso_joken_code_2sai, kyoso_joken_code_3sai, kyoso_joken_code_4sai, kyoso_joken_code_5sai_ijo, kyoso_joken_code_saijakunen"
      )
      .in("race_code", raceCodes);
    const raceByCode = Object.fromEntries((raceRows || []).map((r) => [r.race_code, r]));
    Object.values(byHorse).forEach((list) => {
      list.forEach((row) => {
        row.classWeight = classWeight(raceByCode[row.race_code] || {});
      });
    });
  }

  return byHorse;
}
