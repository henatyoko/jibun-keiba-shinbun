import { supabase } from "./supabaseClient";

// ロジック変更をしても過去レースの印・評価内訳が遡って変わらないよう、
// 「最初に計算された時点」の予想結果をrace_snapshotsに固定して保存し、以降はそれを使う窓口。

// 既にスナップショットがあるレースなら、そこから直接読み込む(重い再計算を省略できる)。
// 戻り値: { [horseNum]: { mark, total, base, hasPastData, applied, pastResults, aiNote } } または、
// スナップショットが無ければ null。
export async function fetchSnapshot(raceCode) {
  const { data, error } = await supabase.from("race_snapshots").select("*").eq("race_code", raceCode);
  if (error || !data || data.length === 0) return null;

  const byNum = {};
  data.forEach((row) => {
    byNum[row.horse_num] = {
      mark: row.mark,
      total: Number(row.total_score),
      base: row.base_score != null ? Number(row.base_score) : null,
      hasPastData: row.has_past_data,
      applied: row.applied || [],
      pastResults: row.past_results || [],
      aiNote: row.ai_note || null,
    };
  });
  return byNum;
}

// このレースにまだスナップショットが無ければ、現在計算された結果を新規保存する。
// 既にあれば何もしない(一意制約(race_code, horse_num)により、後勝ちでの上書きはできない)。
export async function saveSnapshotIfMissing(raceCode, scoredHorses, marksByNum) {
  const rows = scoredHorses.map((h) => ({
    race_code: raceCode,
    horse_num: h.num,
    horse_id: h.horseId ?? null,
    mark: marksByNum[h.num] ?? null,
    total_score: h.total,
    base_score: h.base ?? null,
    has_past_data: Boolean(h.hasPastData),
    applied: h.applied ?? [],
    past_results: h.past ?? [],
    ai_note: h.note ?? null,
  }));
  // 既存行があれば一意制約違反(23505)になるだけなので無視してよい。
  await supabase.from("race_snapshots").insert(rows);
}
