import { supabase } from "../lib/supabaseClient";

// 競走馬マスタ(kyosoba_master2)の距離別成績は「データ作成日(data_sakusei_nengappi)時点」の
// 最新値で、そのレース自身や以降の結果が含まれてしまう。過去レースを振り返る/印を後から
// 計算する時にそのまま使うと、結果を知った状態の距離適性になる(データ漏洩)。
// そのため、各馬の「このレース以降の結果」のうちマスタに反映済みのもの(レース日がデータ作成日以前)を
// 距離バケットごとに引いて、レース前の成績に戻す。まだ結果が出ていないレースでは引くものが無く何も変わらない。

function bucketOf(trackCode, kyori) {
  const t = Number(trackCode);
  const surface = t >= 10 && t <= 22 ? "shiba" : t >= 23 && t <= 29 ? "dirt" : null;
  if (!surface) return null;
  const meters = Number(kyori);
  return `${surface}_${meters <= 1600 ? "short" : meters <= 2200 ? "middle" : "long"}`;
}

function categoryOf(finish) {
  if (finish >= 1 && finish <= 5) return `chaku${finish}`;
  return finish > 5 ? "chakugai" : null;
}

// horseRaceCode: { horseId: そのバッチでの出走race_code }, statsByHorse: { horseId: {bucket: {chaku1..chakugai}} }
// sakuseiByHorse: { horseId: "YYYYMMDD" }。戻り値は引いた後の statsByHorse(新しいオブジェクト)。
export async function toPreRaceDistanceStats(horseRaceCode, statsByHorse, sakuseiByHorse) {
  const horseIds = Object.keys(horseRaceCode);
  if (horseIds.length === 0) return statsByHorse;
  const minRaceCode = Object.values(horseRaceCode).reduce((m, c) => (c < m ? c : m));

  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("umagoto_race_joho")
      .select("ketto_toroku_bango, race_code, kakutei_chakujun")
      .in("ketto_toroku_bango", horseIds)
      .gte("race_code", minRaceCode)
      .not("kakutei_chakujun", "is", null)
      .neq("kakutei_chakujun", "")
      .neq("kakutei_chakujun", "00")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return statsByHorse;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  if (rows.length === 0) return statsByHorse;

  const raceCodes = [...new Set(rows.map((r) => r.race_code))];
  const bucketByRace = {};
  const CHUNK = 150;
  for (let i = 0; i < raceCodes.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("race_shosai")
      .select("race_code, track_code, kyori")
      .in("race_code", raceCodes.slice(i, i + CHUNK));
    if (error) return statsByHorse;
    (data || []).forEach((r) => {
      bucketByRace[r.race_code] = bucketOf(r.track_code, r.kyori);
    });
  }

  const result = { ...statsByHorse };
  rows.forEach((row) => {
    const horseId = row.ketto_toroku_bango;
    const own = horseRaceCode[horseId];
    const sakusei = sakuseiByHorse[horseId];
    if (!own || !sakusei || row.race_code < own) return;
    if (row.race_code.slice(0, 8) > sakusei) return; // マスタに未反映のレースは引かない
    const bucket = bucketByRace[row.race_code];
    const cat = categoryOf(Number(row.kakutei_chakujun));
    const base = result[horseId];
    if (!bucket || !cat || !base || !base[bucket]) return;
    if (result[horseId] === statsByHorse[horseId]) {
      result[horseId] = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { ...v }]));
    }
    result[horseId][bucket][cat] = Math.max(0, result[horseId][bucket][cat] - 1);
  });
  return result;
}
