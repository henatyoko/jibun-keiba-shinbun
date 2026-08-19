import { supabase } from "./supabaseClient";

// JV-Data(umagoto_race_joho)から、各馬の「今見ているレースより前」の直近成績を取る。
// 着順だけでなく人気・上がり3Fも取れるため、基礎点の計算はここを唯一のソースにする。
// (「近○走」の表示やAIコメントは従来通りnetkeiba側のデータを使い続ける)
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
  return byHorse;
}
