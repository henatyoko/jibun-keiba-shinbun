import { supabase } from "./supabaseClient";
import { bestTrainingScore } from "./scoring";

// 追い切り(坂路・ウッド)の時計は十分の一秒単位の文字列。0や999.9のような欠測・異常値は捨てる。
function parseTenths(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n / 10 : null;
}

function isPlausible(t4, l1) {
  return t4 != null && l1 != null && t4 >= 45 && t4 <= 80 && l1 >= 10 && l1 <= 20;
}

// 各馬の「レース前3週間(当日は含まない)」の追い切りから、好時計の度合い(小さいほど速い)を返す。
// 坂路・ウッドとも「4F時計と終い1Fをコース・所属別に標準化した値の和」の最良を使う。
// 追い切りが無い馬は戻り値に含めない。戻り値: { [horseId]: score }
export async function fetchTrainingScores(horseIds, raceCode) {
  if (!horseIds || horseIds.length === 0 || !raceCode) return {};
  const raceDate = raceCode.slice(0, 8);
  const start = new Date(`${raceDate.slice(0, 4)}-${raceDate.slice(4, 6)}-${raceDate.slice(6, 8)}T00:00:00+09:00`);
  start.setDate(start.getDate() - 21);
  const startStr = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}`;

  const PAGE_SIZE = 1000;
  async function fetchAll(table, columns) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in("ketto_toroku_bango", horseIds)
        .gte("chokyo_nengappi", startStr)
        .lt("chokyo_nengappi", raceDate)
        .range(from, from + PAGE_SIZE - 1);
      if (error) return rows;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
    return rows;
  }

  const [hanro, wood] = await Promise.all([
    fetchAll("hanro_chokyo", "ketto_toroku_bango, tracen_kubun, time_gokei_4furlong, lap_time_1furlong"),
    fetchAll("woodchip_chokyo", "ketto_toroku_bango, tracen_kubun, course, time_gokei_4furlong, laptime_1furlong"),
  ]);

  const workoutsByHorse = {};
  const add = (horseId, kind, t4, l1) => {
    if (isPlausible(t4, l1)) (workoutsByHorse[horseId] ||= []).push({ kind, t4, l1 });
  };
  hanro.forEach((r) =>
    add(r.ketto_toroku_bango, `H${r.tracen_kubun}`, parseTenths(r.time_gokei_4furlong), parseTenths(r.lap_time_1furlong))
  );
  wood.forEach((r) =>
    add(r.ketto_toroku_bango, `W${r.tracen_kubun}${r.course}`, parseTenths(r.time_gokei_4furlong), parseTenths(r.laptime_1furlong))
  );

  const scores = {};
  Object.entries(workoutsByHorse).forEach(([horseId, workouts]) => {
    const score = bestTrainingScore(workouts);
    if (score != null) scores[horseId] = score;
  });
  return scores;
}
