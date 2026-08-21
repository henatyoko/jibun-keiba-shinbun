import { supabase } from "./supabaseClient";

// JV-Data(umagoto_race_joho)から、各馬の「今見ているレースより前」の直近成績を取る。
// 着順・人気・上がり3F・獲得本賞金が取れる(獲得本賞金にレースの格と着順の
// 良さの両方が自然に織り込まれているので、基礎点の計算はこれだけで済む)。
// 基礎点・AIコメント生成の唯一のソースとして使う。
export async function fetchJvPastRaces(horseIds, beforeRaceCode) {
  if (!horseIds || horseIds.length === 0 || !beforeRaceCode) return {};

  const { data, error } = await supabase
    .from("umagoto_race_joho")
    .select("ketto_toroku_bango, race_code, kakutei_chakujun, tansho_ninkijun, kohan_3f, kakutoku_honshokin")
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
