import { supabase } from "./supabaseClient";

// 競走馬マスタの距離別着回数(raceSource.jsと同じ列構成)。
const DISTANCE_BUCKETS = ["shiba_short", "shiba_middle", "shiba_long", "dirt_short", "dirt_middle", "dirt_long"];
const DISTANCE_BUCKET_COLUMNS = DISTANCE_BUCKETS.map(
  (b) => `${b}_1chaku, ${b}_2chaku, ${b}_3chaku, ${b}_4chaku, ${b}_5chaku, ${b}_chakugai`
).join(", ");

function emptyStats() {
  const stats = {};
  DISTANCE_BUCKETS.forEach((b) => {
    stats[b] = { chaku1: 0, chaku2: 0, chaku3: 0, chaku4: 0, chaku5: 0, chakugai: 0 };
  });
  return stats;
}

function addRow(stats, row) {
  DISTANCE_BUCKETS.forEach((b) => {
    stats[b].chaku1 += Number(row[`${b}_1chaku`]) || 0;
    stats[b].chaku2 += Number(row[`${b}_2chaku`]) || 0;
    stats[b].chaku3 += Number(row[`${b}_3chaku`]) || 0;
    stats[b].chaku4 += Number(row[`${b}_4chaku`]) || 0;
    stats[b].chaku5 += Number(row[`${b}_5chaku`]) || 0;
    stats[b].chakugai += Number(row[`${b}_chakugai`]) || 0;
  });
}

// 種牡馬1頭の産駒全体(最大300頭サンプル)の距離別着回数を合算して取得する。
// 母父の場合も同じ種牡馬IDの引き方(その馬を父に持つ産駒)で成立する。
async function fetchProduceStats(hanshokuId) {
  const { data } = await supabase
    .from("kyosoba_master2")
    .select(DISTANCE_BUCKET_COLUMNS)
    .eq("ketto1_hanshoku_toroku_bango", hanshokuId)
    .limit(300);

  const stats = emptyStats();
  (data || []).forEach((row) => addRow(stats, row));
  return stats;
}

// レースに出走する馬たちの父・母父それぞれの産駒成績(距離別)をまとめて取得する。
// 新馬戦など本馬自身に距離実績が無い馬の代替シグナルとして使う。
// 戻り値: { [hanshokuId]: distanceStats }
export async function fetchPedigreeAptitude(horses) {
  const ids = [...new Set(horses.flatMap((h) => [h.sireId, h.damsireId]).filter(Boolean))];
  if (ids.length === 0) return {};

  const entries = await Promise.all(ids.map(async (id) => [id, await fetchProduceStats(id)]));
  return Object.fromEntries(entries);
}
