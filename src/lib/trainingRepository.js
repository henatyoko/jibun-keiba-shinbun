import { supabase } from "./supabaseClient";

// 坂路(hanro_chokyo)・ウッドチップ(woodchip_chokyo)の調教タイムのうち、
// コース長に関わらずゴールまでの「後3ハロン(600m~0m)」タイムだけを使う。
// 厩舎によって坂路中心/ウッドチップ中心が分かれるため両方見る。
const COLUMNS = "ketto_toroku_bango, chokyo_nengappi, time_gokei_3furlong";

// 対象馬が多いとSupabase/PostgRESTの1回あたりの上限(既定1000件)を超えるため、
// .range()でページングして全件取得する。
async function fetchAllRows(table, horseIds, beforeStr) {
  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(COLUMNS)
      .in("ketto_toroku_bango", horseIds)
      .lt("chokyo_nengappi", beforeStr)
      .range(from, from + PAGE_SIZE - 1);
    if (error) return rows;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

// レース当日より前の直近調教を、新しい順に最大6本まとめて取得する。
// 戻り値: { [horseId]: [{ date, time3f }] }(新しい順)
export async function fetchRecentTrainingWorks(horseIds, beforeDate) {
  if (!horseIds || horseIds.length === 0 || !beforeDate) return {};
  const beforeStr = beforeDate.replaceAll("-", "");

  const [hanroRows, woodchipRows] = await Promise.all([
    fetchAllRows("hanro_chokyo", horseIds, beforeStr),
    fetchAllRows("woodchip_chokyo", horseIds, beforeStr),
  ]);

  const byHorse = {};
  [...hanroRows, ...woodchipRows].forEach((r) => {
    const t = Number(r.time_gokei_3furlong);
    if (!Number.isFinite(t) || t <= 0) return;
    (byHorse[r.ketto_toroku_bango] ||= []).push({ date: r.chokyo_nengappi, time3f: t / 10 });
  });

  Object.keys(byHorse).forEach((id) => {
    byHorse[id].sort((a, b) => b.date.localeCompare(a.date));
    byHorse[id] = byHorse[id].slice(0, 6);
  });

  return byHorse;
}
