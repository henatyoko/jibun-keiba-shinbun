import { supabase } from "./supabaseClient";
import { scoreHorse, baseScoreFromPastRaces, courseBiasAdjustment, computeMarks } from "./scoring";
import { classWeight } from "../data/jvCodeTables";

// 振り返り表示中の全レースについて、印(◎○▲)ごとの「3位以内的中率」を集計する。
// AI評価・パドックは重い/その場限りの補正のため含めず、基礎点(JV-Data)・枠番傾向・
// 自分ルールだけで印を計算する(個別のレース詳細画面の印とは多少ズレ得る)。
export async function computeMarkAccuracy(races, attrRules, trendRules) {
  const pastReviewRaces = races.filter((r) => r.isPastReview);
  if (pastReviewRaces.length === 0) return null;

  // 同日開催なので馬は1回しか出走しない前提で、馬ID→そのレースのrace_codeを引けるようにする
  const horseRaceCode = {};
  pastReviewRaces.forEach((race) => {
    race.horses.forEach((h) => {
      if (h.horseId) horseRaceCode[h.horseId] = race.id;
    });
  });
  const horseIds = Object.keys(horseRaceCode);
  if (horseIds.length === 0) return null;

  const { data, error } = await supabase
    .from("umagoto_race_joho")
    .select("ketto_toroku_bango, race_code, kakutei_chakujun, tansho_ninkijun, kohan_3f")
    .in("ketto_toroku_bango", horseIds)
    .not("kakutei_chakujun", "is", null)
    .neq("kakutei_chakujun", "")
    .order("race_code", { ascending: false });

  if (error || !data) return null;

  const rowsByHorse = {};
  data.forEach((row) => {
    (rowsByHorse[row.ketto_toroku_bango] ||= []).push(row);
  });

  const jvPastByHorse = {};
  horseIds.forEach((horseId) => {
    const cutoff = horseRaceCode[horseId];
    jvPastByHorse[horseId] = (rowsByHorse[horseId] || []).filter((r) => r.race_code < cutoff).slice(0, 5);
  });

  // 各過去走のレース格(未勝利〜G1)を引くため、対象race_codeの条件情報をまとめて取得する
  const pastRaceCodes = [...new Set(Object.values(jvPastByHorse).flat().map((r) => r.race_code))];
  if (pastRaceCodes.length > 0) {
    const { data: raceRows } = await supabase
      .from("race_shosai")
      .select(
        "race_code, grade_code, kyoso_joken_code_2sai, kyoso_joken_code_3sai, kyoso_joken_code_4sai, kyoso_joken_code_5sai_ijo, kyoso_joken_code_saijakunen"
      )
      .in("race_code", pastRaceCodes);
    const raceByCode = Object.fromEntries((raceRows || []).map((r) => [r.race_code, r]));
    Object.values(jvPastByHorse).forEach((list) => {
      list.forEach((row) => {
        row.classWeight = classWeight(raceByCode[row.race_code] || {});
      });
    });
  }

  const tally = { "◎": { hit: 0, total: 0 }, "○": { hit: 0, total: 0 }, "▲": { hit: 0, total: 0 } };

  pastReviewRaces.forEach((race) => {
    const scored = race.horses.map((h) => {
      const jvPast = jvPastByHorse[h.horseId];
      const hasPastData = Boolean(jvPast && jvPast.length > 0);
      const base = hasPastData ? baseScoreFromPastRaces(jvPast) : h.base;
      const { total, applied } = scoreHorse({ ...h, base }, attrRules, trendRules, race.name);
      const bias = courseBiasAdjustment(h.waku, race.place, race.distance);
      return {
        ...h,
        hasPastData,
        total: total + (bias?.score ?? 0),
        applied: bias ? [...applied, { label: bias.label, score: bias.score }] : applied,
      };
    });
    const byScore = [...scored].sort((a, b) => b.total - a.total);
    const withRank = scored.map((h) => ({ ...h, rank: byScore.findIndex((x) => x.horseId === h.horseId) }));
    const { marksByNum } = computeMarks(withRank);

    withRank.forEach((h) => {
      const mark = marksByNum[h.num];
      if (!mark || !tally[mark]) return;
      tally[mark].total += 1;
      if (h.result && h.result <= 3) tally[mark].hit += 1;
    });
  });

  return tally;
}
