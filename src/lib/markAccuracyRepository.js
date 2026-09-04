import { supabase } from "./supabaseClient";
import {
  scoreHorse,
  baseScoreFromPastRaces,
  courseBiasAdjustment,
  distanceAptitudeAdjustment,
  handicapWeightAdjustment,
  handicapWeightDropAdjustment,
  distanceShorteningAdjustment,
  computeMarks,
} from "./scoring";
import { saveSnapshotIfMissing } from "./raceSnapshotRepository";

function emptyTally() {
  return {
    "◎": { hit: 0, total: 0 },
    "○": { hit: 0, total: 0 },
    "▲": { hit: 0, total: 0 },
    "△": { hit: 0, total: 0 },
    "穴": { hit: 0, total: 0 },
  };
}

function addToTally(tally, mark, result) {
  if (!mark || !tally[mark]) return;
  tally[mark].total += 1;
  if (result && result <= 3) tally[mark].hit += 1;
}

// 振り返り表示中の全レースについて、印(◎○▲△穴)ごとの「3位以内的中率」を集計する。
// ロジック変更をしても過去レースの答え合わせが遡って変わらないよう、race_snapshotsに
// 固定結果があるレースはそれをそのまま使う(重い再計算を省略できる分、速くもなる)。
// スナップショットが無いレースだけ、基礎点(JV-Data)・枠番傾向・自分ルールで計算し、
// 計算し次第スナップショットとして保存する(個別のレース詳細画面の印とは多少ズレ得る:
// AI評価・パドックは重い/その場限りの補正のため、まだスナップショットが無いレースの
// この集計では含めない)。
export async function computeMarkAccuracy(races, attrRules, trendRules) {
  const pastReviewRaces = races.filter((r) => r.isPastReview);
  if (pastReviewRaces.length === 0) return null;

  const raceCodes = pastReviewRaces.map((r) => r.id);
  const { data: snapshotRows } = await supabase.from("race_snapshots").select("*").in("race_code", raceCodes);
  const snapshotsByRace = {};
  (snapshotRows || []).forEach((row) => {
    (snapshotsByRace[row.race_code] ||= {})[row.horse_num] = row;
  });

  const tally = emptyTally();

  const racesNeedingCompute = pastReviewRaces.filter((race) => !snapshotsByRace[race.id]);

  // スナップショット済みのレースは、固定結果をそのまま集計に使う
  pastReviewRaces
    .filter((race) => snapshotsByRace[race.id])
    .forEach((race) => {
      const snap = snapshotsByRace[race.id];
      race.horses.forEach((h) => {
        const row = snap[h.num];
        if (row) addToTally(tally, row.mark, h.result);
      });
    });

  if (racesNeedingCompute.length === 0) return tally;

  // 同日開催なので馬は1回しか出走しない前提で、馬ID→そのレースのrace_codeを引けるようにする
  const horseRaceCode = {};
  racesNeedingCompute.forEach((race) => {
    race.horses.forEach((h) => {
      if (h.horseId) horseRaceCode[h.horseId] = race.id;
    });
  });
  const horseIds = Object.keys(horseRaceCode);
  if (horseIds.length === 0) return tally;

  // 全馬の全キャリア(2018年〜)を毎回読むと重いため、直近450日분だけに絞る
  // (基礎点は直近5走しか使わないので、それより古い分を取っても意味が無い)。
  const earliestReviewDate = racesNeedingCompute.reduce(
    (min, r) => (r.rawDate < min ? r.rawDate : min),
    racesNeedingCompute[0].rawDate
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
      .select("ketto_toroku_bango, race_code, kakutei_chakujun, tansho_ninkijun, kohan_3f, kakutoku_honshokin, futan_juryo")
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

  const rowsByHorse = {};
  data.forEach((row) => {
    (rowsByHorse[row.ketto_toroku_bango] ||= []).push(row);
  });

  const jvPastByHorse = {};
  horseIds.forEach((horseId) => {
    const cutoff = horseRaceCode[horseId];
    jvPastByHorse[horseId] = (rowsByHorse[horseId] || []).filter((r) => r.race_code < cutoff).slice(0, 5);
  });

  // 距離短縮判定用に、各馬の前走(先頭行)のレース距離・トラック種別を付与する。
  const latestRaceCodes = [...new Set(Object.values(jvPastByHorse).map((rows) => rows[0]?.race_code).filter(Boolean))];
  if (latestRaceCodes.length > 0) {
    const { data: raceMeta } = await supabase
      .from("race_shosai")
      .select("race_code, kyori, track_code, keibajo_code")
      .in("race_code", latestRaceCodes);
    const metaByCode = Object.fromEntries((raceMeta || []).map((r) => [r.race_code, r]));
    Object.values(jvPastByHorse).forEach((rows) => {
      const meta = rows[0] && metaByCode[rows[0].race_code];
      if (meta) Object.assign(rows[0], meta);
    });
  }

  racesNeedingCompute.forEach((race) => {
    const futanJuryoList = race.horses.map((h) => h.futanJuryo).filter((v) => Number.isFinite(v));
    const fieldAvgFutanJuryo =
      futanJuryoList.length > 0 ? futanJuryoList.reduce((sum, v) => sum + v, 0) / futanJuryoList.length : null;
    const scored = race.horses.map((h) => {
      const jvPast = jvPastByHorse[h.horseId];
      const hasPastData = Boolean(jvPast && jvPast.length > 0);
      const base = hasPastData ? baseScoreFromPastRaces(jvPast, race.id) : h.base;
      const { total, applied } = scoreHorse({ ...h, base }, attrRules, trendRules, race.name);
      const bias = courseBiasAdjustment(h.waku, race.place, race.distance);
      const aptitude = distanceAptitudeAdjustment(h.distanceStats, race.distance);
      const handicap = handicapWeightAdjustment(race.isHandicap, h.futanJuryo, fieldAvgFutanJuryo);
      const handicapDrop = handicapWeightDropAdjustment(race.isHandicap, h.futanJuryo, jvPast);
      const shortening = distanceShorteningAdjustment(race, jvPast?.[0]);
      const extra = [
        ...(bias ? [{ label: bias.label, score: bias.score }] : []),
        ...(aptitude ? [{ label: aptitude.label, score: aptitude.score }] : []),
        ...(handicap ? [{ label: handicap.label, score: handicap.score }] : []),
        ...(handicapDrop ? [{ label: handicapDrop.label, score: handicapDrop.score }] : []),
        ...(shortening ? [{ label: shortening.label, score: shortening.score }] : []),
      ];
      return {
        ...h,
        base,
        past: jvPast,
        hasPastData,
        total:
          total +
          (bias?.score ?? 0) +
          (aptitude?.score ?? 0) +
          (handicap?.score ?? 0) +
          (handicapDrop?.score ?? 0) +
          (shortening?.score ?? 0),
        applied: [...applied, ...extra],
      };
    });
    const byScore = [...scored].sort((a, b) => b.total - a.total);
    const withRank = scored.map((h) => ({ ...h, rank: byScore.findIndex((x) => x.horseId === h.horseId) }));
    const { marksByNum, noDifferentiation } = computeMarks(withRank);

    withRank.forEach((h) => {
      addToTally(tally, marksByNum[h.num], h.result);
    });

    if (!noDifferentiation) {
      saveSnapshotIfMissing(race.id, withRank, marksByNum).catch(() => {});
    }
  });

  return tally;
}
