import { supabase } from "./supabaseClient";
import {
  scoreHorse,
  baseScoreFromPastRaces,
  courseBiasAdjustment,
  distanceAptitudeAdjustment,
  handicapWeightAdjustment,
  trainingAdjustment,
  computeMarks,
} from "./scoring";
import { fetchRecentTrainingWorks } from "./trainingRepository";

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

  // 全馬の全キャリア(2018年〜)を毎回読むと重いため、直近450日분だけに絞る
  // (基礎点は直近5走しか使わないので、それより古い分を取っても意味が無い)。
  const earliestReviewDate = pastReviewRaces.reduce(
    (min, r) => (r.rawDate < min ? r.rawDate : min),
    pastReviewRaces[0].rawDate
  );
  const cutoffDate = new Date(`${earliestReviewDate}T00:00:00+09:00`);
  cutoffDate.setDate(cutoffDate.getDate() - 450);
  const cutoffPrefix = `${cutoffDate.getFullYear()}${String(cutoffDate.getMonth() + 1).padStart(2, "0")}${String(cutoffDate.getDate()).padStart(2, "0")}`;

  // 対象馬が多いと該当行数がSupabase/PostgRESTの1回あたりの上限(既定1000件)を超えるため、
  // .range()でページングして全件取得する(打ち切られると新しい順に一部の馬だけ過去走データが
  // 欠け、基礎点が不当に70固定になってしまう)。
  const PAGE_SIZE = 1000;
  const data = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("umagoto_race_joho")
      .select("ketto_toroku_bango, race_code, kakutei_chakujun, tansho_ninkijun, kohan_3f, kakutoku_honshokin")
      .in("ketto_toroku_bango", horseIds)
      .gte("race_code", `${cutoffPrefix}0000000000`)
      .not("kakutei_chakujun", "is", null)
      .neq("kakutei_chakujun", "")
      .order("race_code", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return null;
    if (!page || page.length === 0) break;
    data.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const trainingByHorse = await fetchRecentTrainingWorks(horseIds, pastReviewRaces[0].rawDate);

  const rowsByHorse = {};
  data.forEach((row) => {
    (rowsByHorse[row.ketto_toroku_bango] ||= []).push(row);
  });

  const jvPastByHorse = {};
  horseIds.forEach((horseId) => {
    const cutoff = horseRaceCode[horseId];
    jvPastByHorse[horseId] = (rowsByHorse[horseId] || []).filter((r) => r.race_code < cutoff).slice(0, 5);
  });

  const tally = {
    "◎": { hit: 0, total: 0 },
    "○": { hit: 0, total: 0 },
    "▲": { hit: 0, total: 0 },
    "△": { hit: 0, total: 0 },
    "穴": { hit: 0, total: 0 },
  };

  pastReviewRaces.forEach((race) => {
    const futanJuryoList = race.horses.map((h) => h.futanJuryo).filter((v) => Number.isFinite(v));
    const fieldAvgFutanJuryo =
      futanJuryoList.length > 0 ? futanJuryoList.reduce((sum, v) => sum + v, 0) / futanJuryoList.length : null;
    const scored = race.horses.map((h) => {
      const jvPast = jvPastByHorse[h.horseId];
      const hasPastData = Boolean(jvPast && jvPast.length > 0);
      const base = hasPastData ? baseScoreFromPastRaces(jvPast) : h.base;
      const { total, applied } = scoreHorse({ ...h, base }, attrRules, trendRules, race.name);
      const bias = courseBiasAdjustment(h.waku, race.place, race.distance);
      const aptitude = distanceAptitudeAdjustment(h.distanceStats, race.distance);
      const handicap = handicapWeightAdjustment(race.isHandicap, h.futanJuryo, fieldAvgFutanJuryo);
      const training = trainingAdjustment(trainingByHorse[h.horseId]);
      const extra = [
        ...(bias ? [{ label: bias.label, score: bias.score }] : []),
        ...(aptitude ? [{ label: aptitude.label, score: aptitude.score }] : []),
        ...(handicap ? [{ label: handicap.label, score: handicap.score }] : []),
        ...(training ? [{ label: training.label, score: training.score }] : []),
      ];
      return {
        ...h,
        hasPastData,
        total: total + (bias?.score ?? 0) + (aptitude?.score ?? 0) + (handicap?.score ?? 0) + (training?.score ?? 0),
        applied: [...applied, ...extra],
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
