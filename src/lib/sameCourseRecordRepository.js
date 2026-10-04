import { supabase } from "./supabaseClient";

// 各馬の「このレースより前」の、同じ競馬場・同じ距離・同じ芝/ダートでの成績を集計する(同コース好走判定用)。
// raceCode: 今回のレースのrace_code(9〜10桁目が競馬場コード)、distanceStr例: "芝2400m"
// 戻り値: { [horseId]: { starts, top3 } }
export async function fetchSameCourseRecords(horseIds, raceCode, distanceStr) {
  const match = distanceStr?.match(/^(芝|ダ)(\d+)m/);
  if (!horseIds || horseIds.length === 0 || !raceCode || !match) return {};
  const [, surface, meters] = match;
  const keibajoCode = raceCode.slice(8, 10);

  // まず同じ競馬場での過去走だけに絞る(umagoto_race_johoに距離は無いので、距離・芝ダは後でrace_shosaiで判定)
  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("umagoto_race_joho")
      .select("ketto_toroku_bango, race_code, kakutei_chakujun")
      .in("ketto_toroku_bango", horseIds)
      .eq("keibajo_code", keibajoCode)
      .lt("race_code", raceCode)
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

  const raceCodes = [...new Set(rows.map((r) => r.race_code))];
  const sameCourseRaces = new Set();
  const CHUNK = 200;
  for (let i = 0; i < raceCodes.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("race_shosai")
      .select("race_code, kyori, track_code")
      .in("race_code", raceCodes.slice(i, i + CHUNK));
    if (error) return {};
    (data || []).forEach((r) => {
      const t = Number(r.track_code);
      const pastSurface = t >= 10 && t <= 22 ? "芝" : t >= 23 && t <= 29 ? "ダ" : null;
      if (pastSurface === surface && Number(r.kyori) === Number(meters)) sameCourseRaces.add(r.race_code);
    });
  }

  const records = {};
  rows.forEach((row) => {
    if (!sameCourseRaces.has(row.race_code)) return;
    const rec = (records[row.ketto_toroku_bango] ||= { starts: 0, top3: 0 });
    rec.starts += 1;
    if (Number(row.kakutei_chakujun) <= 3) rec.top3 += 1;
  });
  return records;
}
