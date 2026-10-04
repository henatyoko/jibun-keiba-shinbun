import { supabase } from "./supabaseClient";
import { trackConditionLabel } from "../data/jvCodeTables";

// 各馬の「このレースより前」の、重・不良/良馬場での3着内実績を集計する(道悪巧者判定用)。
// 当日の馬場が重・不良のレースでしか使わないので、呼び出し側でその時だけ呼ぶこと。
// 戻り値: { [horseId]: { wetStarts, wetTop3, goodStarts, goodTop3 } }
export async function fetchWetRecords(horseIds, beforeRaceCode) {
  if (!horseIds || horseIds.length === 0 || !beforeRaceCode) return {};

  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("umagoto_race_joho")
      .select("ketto_toroku_bango, race_code, kakutei_chakujun")
      .in("ketto_toroku_bango", horseIds)
      .lt("race_code", beforeRaceCode)
      .not("kakutei_chakujun", "is", null)
      .neq("kakutei_chakujun", "")
      .neq("kakutei_chakujun", "00")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return {};
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  if (rows.length === 0) return {};

  // 過去走それぞれのレースの馬場状態(race_shosai)を引く
  const raceCodes = [...new Set(rows.map((r) => r.race_code))];
  const conditionByRace = {};
  const CHUNK = 200;
  for (let i = 0; i < raceCodes.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("race_shosai")
      .select("race_code, track_code, shiba_babajotai_code, dirt_babajotai_code")
      .in("race_code", raceCodes.slice(i, i + CHUNK));
    if (error) return {};
    (data || []).forEach((r) => {
      conditionByRace[r.race_code] = trackConditionLabel(r);
    });
  }

  const records = {};
  rows.forEach((row) => {
    const cond = conditionByRace[row.race_code];
    const isWet = cond === "重" || cond === "不良";
    if (!isWet && cond !== "良") return;
    const rec = (records[row.ketto_toroku_bango] ||= { wetStarts: 0, wetTop3: 0, goodStarts: 0, goodTop3: 0 });
    const top3 = Number(row.kakutei_chakujun) <= 3;
    if (isWet) {
      rec.wetStarts += 1;
      if (top3) rec.wetTop3 += 1;
    } else {
      rec.goodStarts += 1;
      if (top3) rec.goodTop3 += 1;
    }
  });
  return records;
}
