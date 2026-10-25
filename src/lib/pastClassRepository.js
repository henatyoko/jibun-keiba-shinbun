import { supabase } from "./supabaseClient";
import { gradeBadge } from "../data/jvCodeTables";

// 各馬の過去走(jvPastByHorse)のレースが、どのクラス(新馬/未勝利/1勝クラス…/G1)だったかを引く。
// 格上挑戦の判定(今回のクラスと過去走の最高クラスの比較)に使う。
// 戻り値: { [race_code]: "1勝クラス" などのバッジ名 }
export async function fetchPastRaceGrades(jvPastByHorse) {
  const raceCodes = [...new Set(Object.values(jvPastByHorse || {}).flat().map((r) => r.race_code))];
  const grades = {};
  const CHUNK = 150;
  for (let i = 0; i < raceCodes.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("race_shosai")
      .select(
        "race_code, grade_code, kyosomei_hondai, kyoso_joken_code_2sai, kyoso_joken_code_3sai, kyoso_joken_code_4sai, kyoso_joken_code_5sai_ijo, kyoso_joken_code_saijakunen, kyoso_shubetsu_code"
      )
      .in("race_code", raceCodes.slice(i, i + CHUNK));
    if (error) return {};
    (data || []).forEach((r) => {
      grades[r.race_code] = gradeBadge(r);
    });
  }
  return grades;
}
