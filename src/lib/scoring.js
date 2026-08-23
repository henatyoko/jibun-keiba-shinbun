import { courseBiasFor } from "../data/courseBias";
import { MARKS } from "./colors";

// 開催競馬場・馬場・距離から、一般的に知られる枠順傾向による小さな補正を返す。
// distanceStr例: "芝2400m" / "ダ1200m"
export function courseBiasAdjustment(waku, place, distanceStr) {
  const match = distanceStr?.match(/^(芝|ダ)(\d+)m/);
  if (!match || !waku) return null;
  const [, surface, meters] = match;
  const bias = courseBiasFor(place, surface, Number(meters));
  if (!bias) return null;
  const score = bias.wakuBonus(waku);
  if (!score) return null;
  return { label: bias.label, score };
}

// ハンデ戦限定で、斤量が同レースの平均より軽いほど加点、重いほど減点する補正を返す。
// ハンデ戦は競走馬ごとにJRAが実力を見て個別に斤量を決めるため、軽ハンデ=実力を
// 低く見られている=荒れた時の価値が高い、という読み方をする。ハンデ戦以外はnull。
export function handicapWeightAdjustment(isHandicap, futanJuryo, fieldAvgFutanJuryo) {
  if (!isHandicap) return null;
  if (!Number.isFinite(futanJuryo) || !Number.isFinite(fieldAvgFutanJuryo)) return null;
  const diffKg = fieldAvgFutanJuryo - futanJuryo; // 正なら平均より軽い
  const score = Math.max(-3, Math.min(3, Math.round(diffKg * 1.5)));
  if (score === 0) return null;
  return { label: `斤量${futanJuryo.toFixed(1)}kg`, score };
}

// distanceStr("芝2400m"等)から、競走馬マスタの距離別集計で使うバケットキーを求める。
// 短距離[〜1600m]/中距離[1601〜2200m]/長距離[2201m〜]。
function distanceBucketKey(distanceStr) {
  const match = distanceStr?.match(/^(芝|ダ)(\d+)m/);
  if (!match) return null;
  const [, surface, metersStr] = match;
  const meters = Number(metersStr);
  const surfaceKey = surface === "芝" ? "shiba" : "dirt";
  const rangeKey = meters <= 1600 ? "short" : meters <= 2200 ? "middle" : "long";
  return { key: `${surfaceKey}_${rangeKey}`, surfaceLabel: surface };
}

function sumStats(stats) {
  if (!stats) return 0;
  return stats.chaku1 + stats.chaku2 + stats.chaku3 + stats.chaku4 + stats.chaku5 + stats.chakugai;
}

// 本馬自身の距離別実績が(距離適性の判定に足りるだけ)あるかどうか。
// 無ければ呼び出し側は血統(父・母父の産駒成績)を代替シグナルとして使う。
export function hasOwnDistanceData(distanceStats, distanceStr) {
  const bucket = distanceBucketKey(distanceStr);
  if (!bucket || !distanceStats) return false;
  return sumStats(distanceStats[bucket.key]) >= 2;
}

// 競走馬マスタの距離別通算成績(芝/ダート×短距離[〜1600m]/中距離[1601〜2200m]/
// 長距離[2201m〜])から、今日のレースの距離での適性による補正を返す。
// 3着内率が高いほど加点、出走数が少ない/着外続きなら減点。データが薄ければnull。
export function distanceAptitudeAdjustment(distanceStats, distanceStr) {
  const bucket = distanceBucketKey(distanceStr);
  if (!bucket || !distanceStats) return null;
  const stats = distanceStats[bucket.key];
  if (!stats) return null;

  const starts = sumStats(stats);
  if (starts < 2) return null; // データ不足

  const top3 = stats.chaku1 + stats.chaku2 + stats.chaku3;
  const top3Rate = top3 / starts;
  const score = Math.max(-2, Math.min(3, Math.round((top3Rate - 0.3) * 6)));
  if (score === 0) return null;

  return { label: `距離適性${bucket.surfaceLabel}${top3}/${starts}`, score };
}

// 本馬自身に距離実績が無い(新馬戦など)時の代替シグナル。父・母父それぞれの
// 産駒全体の距離別成績を合算し、3着内率で軽めの補正を返す(personalな
// distanceAptitudeAdjustmentより控えめな上限)。サンプルが少なければnull。
export function pedigreeAptitudeAdjustment(sireStats, damsireStats, distanceStr) {
  const bucket = distanceBucketKey(distanceStr);
  if (!bucket) return null;

  const combined = { chaku1: 0, chaku2: 0, chaku3: 0, chaku4: 0, chaku5: 0, chakugai: 0 };
  [sireStats?.[bucket.key], damsireStats?.[bucket.key]].forEach((s) => {
    if (!s) return;
    Object.keys(combined).forEach((k) => (combined[k] += s[k] ?? 0));
  });

  const starts = sumStats(combined);
  if (starts < 20) return null; // 産駒サンプルが少なければ判断しない

  const top3 = combined.chaku1 + combined.chaku2 + combined.chaku3;
  const top3Rate = top3 / starts;
  const score = Math.max(-2, Math.min(2, Math.round((top3Rate - 0.3) * 5)));
  if (score === 0) return null;

  return { label: `血統距離適性${bucket.surfaceLabel}${top3}/${starts}`, score };
}

// パドックで実際に見た印象(ユーザー自身の入力)による小さな補正。
const PADDOCK_SCORE = { A: 3, B: 1, 無印: -2 };

export function paddockAdjustment(grade) {
  if (!grade || !(grade in PADDOCK_SCORE)) return null;
  return { label: `パドック${grade}`, score: PADDOCK_SCORE[grade] };
}

// 属性ルール・傾向ルールを1頭の馬に適用し、合計スコアを算出する。
export function scoreHorse(horse, attrRules, trendRules, raceName) {
  const applied = [];

  attrRules.forEach((rule) => {
    if (
      (rule.type === "血統" && horse.sire === rule.value) ||
      (rule.type === "騎手" && horse.jockey === rule.value) ||
      (rule.type === "厩舎" && horse.trainer === rule.value) ||
      (rule.type === "馬主" && horse.owner === rule.value)
    ) {
      applied.push({ label: `${rule.type}:${rule.value}`, score: rule.score });
    }
  });

  trendRules
    .filter((rule) => rule.race === raceName)
    .forEach((rule) => {
      if (rule.type === "馬齢" && `${horse.age}歳` === rule.value) {
        applied.push({ label: rule.label, score: rule.score });
      }
      if (rule.type === "枠番" && rule.value === "8枠以降" && horse.waku >= 8) {
        applied.push({ label: rule.label, score: rule.score });
      }
    });

  const bonus = applied.reduce((sum, a) => sum + a.score, 0);
  return { total: horse.base + bonus, bonus, applied };
}

// その1走で稼いだ獲得本賞金(円)から着順ポイントを算出する。
// 賞金0円(着外)は-2点、対数スケールで賞金が大きいほど加点する
// (100万円で0点・500万円級=未勝利/新馬勝ち相当で+5点前後・4000万円級=G3勝ち相当で+11点前後・
// 1億円級=G1勝ち相当で+14点)。レースの格と着順の良さの両方が賞金額に自然に
// 織り込まれているため、これ単体でレース格による重み付けを兼ねる。
function moneyPoint(honshokinRaw) {
  const yen = Number(honshokinRaw) * 100; // JV-Dataの本賞金は100円単位の数値文字列
  if (!Number.isFinite(yen) || yen <= 0) return -2;
  return Math.max(-2, Math.min(16, (Math.log10(yen) - 6) * 7));
}

// 直近成績(JV-Data由来。新しい順で最大5走)から基礎スコアを算出する。
// (1)獲得本賞金からその1走の価値を点数化(レースの格・着順の良さを両方反映)、
// (2)直近ほど重みを付ける、(3)上がり3Fが直近ほど速くなっていれば上向きとして加点、
// の3軸で調整する。市場の人気・オッズは意図的に見ない(このアプリの狙いは
// 市場に追従することではなく独自の評価をすることのため)。
// データが無ければ既定値(70)のまま。
export function baseScoreFromPastRaces(pastRaces) {
  if (!pastRaces || pastRaces.length === 0) return 70;

  const RECENCY_WEIGHTS = [5, 4, 3, 2, 1];
  let weightedSum = 0;
  let weightTotal = 0;
  let sampleCount = 0;

  pastRaces.slice(0, 5).forEach((r, i) => {
    const finish = Number(r.kakutei_chakujun);
    if (!Number.isFinite(finish) || finish <= 0) return;

    const point = moneyPoint(r.kakutoku_honshokin);

    const weight = RECENCY_WEIGHTS[i] ?? 1;
    weightedSum += point * weight;
    weightTotal += weight;
    sampleCount += 1;
  });

  if (weightTotal === 0) return 70;
  // 実績のある過去走数(sampleCount)が少ないほど基礎点70寄りに評価を弱める(縮小)。
  // 新馬・未勝利戦は出走馬の多くが1走以下しか実績が無く、1走だけの結果でスコアが
  // 大きく振れてしまい、3着以内的中率が異常に低くなることが実データ検証で判明したため。
  const shrinkFactor = Math.min(sampleCount / 5, 1);
  let avg = (weightedSum / weightTotal) * shrinkFactor;

  const agariTimes = pastRaces
    .slice(0, 5)
    .map((r) => Number(r.kohan_3f))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => v / 10); // JV-Dataは0.1秒単位の数値文字列("433"=43.3秒)
  if (agariTimes.length >= 2) {
    const [latest, ...rest] = agariTimes;
    const restAvg = rest.reduce((sum, v) => sum + v, 0) / rest.length;
    const improve = restAvg - latest; // 正なら直近の方が上がりが速い(良化)
    avg += Math.max(-2, Math.min(2, improve * 4));
  }

  return Math.round(70 + avg * 3);
}

// スコア済みの馬一覧(num, rank, total, hasPastData, appliedを持つ)から印を判定する。
// ◎○▲はスコア上位固定、△は3位との得点差が僅かな馬全員(0〜複数頭)、
// 穴は機械的に5位固定にせず「得点は低いが加点材料がある馬」の中で最高得点の馬だけに付ける。
// 過去データも補正も無く全馬横並びの時は、枠番順がそのまま印になって紛らわしいため
// 印を一切付けない(noDifferentiation)。
const TRIANGLE_THRESHOLD = 5;

export function computeMarks(scored) {
  const noDifferentiation = scored.every((h) => !h.hasPastData && h.applied.length === 0);
  if (noDifferentiation) return { marksByNum: {}, noDifferentiation };

  const byRank = [...scored].sort((a, b) => a.rank - b.rank);
  const marks = {};
  byRank.slice(0, 3).forEach((h, i) => {
    marks[h.num] = MARKS[i];
  });
  const third = byRank[2];
  if (third) {
    byRank.forEach((h) => {
      if (marks[h.num]) return;
      const diff = third.total - h.total;
      if (diff >= 0 && diff <= TRIANGLE_THRESHOLD) {
        marks[h.num] = MARKS[3];
      }
    });
  }
  const anaCandidates = byRank.filter((h) => !marks[h.num] && h.applied.some((a) => a.score > 0));
  if (anaCandidates.length > 0) {
    const best = anaCandidates.reduce((a, b) => (b.total > a.total ? b : a));
    marks[best.num] = MARKS[4];
  }

  return { marksByNum: marks, noDifferentiation: false };
}
