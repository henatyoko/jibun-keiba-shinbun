import { supabase } from "./supabaseClient";
import {
  scoreHorse,
  baseScoreFromPastRaces,
  courseBiasAdjustment,
  distanceAptitudeAdjustment,
  handicapWeightAdjustment,
  handicapWeightDropAdjustment,
  shadaiLayoffAdjustment,
  jockeyAbandonmentAdjustment,
  bodyWeightAdjustment,
  wetSpecialistAdjustment,
  computeMarks,
} from "./scoring";
import { saveSnapshotIfMissing } from "./raceSnapshotRepository";
import { fetchWetRecords } from "./wetRecordRepository";

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

// 印が付いた馬(◎○▲△穴)をまとめてBOXで買ったと仮定した時の的中判定。
// 上位3着が全員印の中に入っていれば3連複BOX的中、2頭だけならワイドBOX的中
// (上位3着のうちどの2頭の組み合わせでもよい)。不的中は表示不要のためnullを返す。
function computeBoxHit(race, markedNums) {
  const top3 = race.horses.filter((h) => h.result && h.result <= 3);
  if (top3.length < 3 || markedNums.size === 0) return null;
  const hitCount = top3.filter((h) => markedNums.has(h.num)).length;
  if (hitCount === 3) return "trifecta";
  if (hitCount === 2) return "wide";
  return null;
}

// ◎の馬が単勝的中(1着)したかどうかの判定。
function computeTanshoHit(race, honshiNum) {
  if (honshiNum == null) return null;
  const honshi = race.horses.find((h) => h.num === honshiNum);
  if (!honshi || !honshi.result) return null;
  return honshi.result === 1;
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
  const perRace = {};

  const racesNeedingCompute = pastReviewRaces.filter((race) => !snapshotsByRace[race.id]);

  // スナップショット済みのレースは、固定結果をそのまま集計に使う
  pastReviewRaces
    .filter((race) => snapshotsByRace[race.id])
    .forEach((race) => {
      const snap = snapshotsByRace[race.id];
      const markedNums = new Set();
      let honshiNum = null;
      race.horses.forEach((h) => {
        const row = snap[h.num];
        if (row) {
          addToTally(tally, row.mark, h.result);
          if (row.mark) markedNums.add(h.num);
          if (row.mark === "◎") honshiNum = h.num;
        }
      });
      perRace[race.id] = { boxHit: computeBoxHit(race, markedNums), tanshoHit: computeTanshoHit(race, honshiNum) };
    });

  if (racesNeedingCompute.length === 0) return { tally, perRace };

  // 同日開催なので馬は1回しか出走しない前提で、馬ID→そのレースのrace_codeを引けるようにする
  const horseRaceCode = {};
  racesNeedingCompute.forEach((race) => {
    race.horses.forEach((h) => {
      if (h.horseId) horseRaceCode[h.horseId] = race.id;
    });
  });
  const horseIds = Object.keys(horseRaceCode);
  if (horseIds.length === 0) return { tally, perRace };

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
      .select("ketto_toroku_bango, race_code, kakutei_chakujun, tansho_ninkijun, kohan_3f, kakutoku_honshokin, futan_juryo, kishumei_ryakusho")
      .in("ketto_toroku_bango", horseIds)
      .gte("race_code", `${cutoffPrefix}0000000000`)
      .not("kakutei_chakujun", "is", null)
      .neq("kakutei_chakujun", "")
      .neq("kakutei_chakujun", "00")
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

  // 重・不良のレースだけ、道悪巧者判定用の過去の馬場別成績を取る
  const wetRecordsByRace = {};
  await Promise.all(
    racesNeedingCompute
      .filter((race) => race.trackCondition === "重" || race.trackCondition === "不良")
      .map(async (race) => {
        wetRecordsByRace[race.id] = await fetchWetRecords(
          race.horses.map((h) => h.horseId).filter(Boolean),
          race.id
        );
      })
  );

  racesNeedingCompute.forEach((race) => {
    const futanJuryoList = race.horses.map((h) => h.futanJuryo).filter((v) => Number.isFinite(v));
    const fieldAvgFutanJuryo =
      futanJuryoList.length > 0 ? futanJuryoList.reduce((sum, v) => sum + v, 0) / futanJuryoList.length : null;
    // 「乗り捨て」判定のため、同じレースの全馬の(今回の騎手, 前走の騎手)を先に集めておく
    const raceJockeyContext = race.horses.map((h) => ({
      horseId: h.horseId,
      jockey: h.jockey,
      prevJockey: jvPastByHorse[h.horseId]?.[0]?.kishumei_ryakusho?.trim() || null,
    }));
    const scored = race.horses.map((h) => {
      const jvPast = jvPastByHorse[h.horseId];
      const hasPastData = Boolean(jvPast && jvPast.length > 0);
      const base = hasPastData ? baseScoreFromPastRaces(jvPast, race.id) : h.base;
      const { total, applied } = scoreHorse({ ...h, base }, attrRules, trendRules, race.name);
      const bias = courseBiasAdjustment(h.waku, race.place, race.distance);
      const aptitude = distanceAptitudeAdjustment(h.distanceStats, race.distance);
      const handicap = handicapWeightAdjustment(race.isHandicap, h.futanJuryo, fieldAvgFutanJuryo);
      const handicapDrop = handicapWeightDropAdjustment(race.isHandicap, h.futanJuryo, jvPast);
      const shadaiLayoff = shadaiLayoffAdjustment(h.breeder, race.id, jvPast);
      const abandonment = jockeyAbandonmentAdjustment(
        h.horseId,
        h.jockey,
        jvPast?.[0]?.kishumei_ryakusho?.trim() || null,
        raceJockeyContext
      );
      const bodyWeight = bodyWeightAdjustment(race.grade, h.bataiju, race.place);
      const wetSpecialist = wetSpecialistAdjustment(race.trackCondition, wetRecordsByRace[race.id]?.[h.horseId]);
      const extra = [
        ...(bias ? [{ label: bias.label, score: bias.score }] : []),
        ...(aptitude ? [{ label: aptitude.label, score: aptitude.score }] : []),
        ...(handicap ? [{ label: handicap.label, score: handicap.score }] : []),
        ...(handicapDrop ? [{ label: handicapDrop.label, score: handicapDrop.score }] : []),
        ...(shadaiLayoff ? [{ label: shadaiLayoff.label, score: shadaiLayoff.score }] : []),
        ...(abandonment ? [{ label: abandonment.label, score: abandonment.score }] : []),
        ...(bodyWeight ? [{ label: bodyWeight.label, score: bodyWeight.score }] : []),
        ...(wetSpecialist ? [{ label: wetSpecialist.label, score: wetSpecialist.score }] : []),
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
          (shadaiLayoff?.score ?? 0) +
          (abandonment?.score ?? 0) +
          (bodyWeight?.score ?? 0) +
          (wetSpecialist?.score ?? 0),
        applied: [...applied, ...extra],
      };
    });
    const byScore = [...scored].sort((a, b) => b.total - a.total);
    const withRank = scored.map((h) => ({ ...h, rank: byScore.findIndex((x) => x.horseId === h.horseId) }));
    const { marksByNum, noDifferentiation } = computeMarks(withRank);

    const markedNums = new Set();
    let honshiNum = null;
    withRank.forEach((h) => {
      addToTally(tally, marksByNum[h.num], h.result);
      if (marksByNum[h.num]) markedNums.add(h.num);
      if (marksByNum[h.num] === "◎") honshiNum = h.num;
    });
    perRace[race.id] = { boxHit: computeBoxHit(race, markedNums), tanshoHit: computeTanshoHit(race, honshiNum) };

    if (!noDifferentiation) {
      saveSnapshotIfMissing(race.id, withRank, marksByNum).catch(() => {});
    }
  });

  return { tally, perRace };
}
