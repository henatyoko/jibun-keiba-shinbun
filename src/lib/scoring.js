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

// ハンデ戦限定で、本馬がこれまでに背負ったことのある斤量(直近5走)の最軽量と比べて、
// 今回さらに軽くなっている(=過去に経験の無い軽さ)場合に加点する。
// レース平均との比較(handicapWeightAdjustment)とは別のシグナルで、
// 「ハンデ担当者が過去の実績以上に評価を大きく下げてきた」ことを捉える狙い。
export function handicapWeightDropAdjustment(isHandicap, futanJuryo, pastRaces) {
  if (!isHandicap || !Number.isFinite(futanJuryo)) return null;
  const pastWeights = (pastRaces || [])
    .map((r) => Number(r.futan_juryo))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => v / 10); // JV-Dataは0.1kg単位の数値文字列("560"=56.0kg)
  if (pastWeights.length < 2) return null; // データ不足

  const minPastWeight = Math.min(...pastWeights);
  const dropKg = minPastWeight - futanJuryo; // 正なら過去最軽量よりさらに軽い
  if (dropKg < 1) return null; // 1kg未満の差は誤差程度として無視

  const score = Math.min(3, Math.round(dropKg));
  return { label: `過去最軽量-${dropKg.toFixed(1)}kg`, score };
}

// 社台グループ系の生産牧場(表記ゆれ込み)。ノーザンファーム等の充実した外厩・
// 育成環境を持つ牧場は、休養期間中も仕上がりが崩れにくいという考え方から、
// 休養明け(新馬戦のデビューも含む)の馬に小さく加点する。
const SHADAI_GROUP_FARMS = new Set([
  "社台ファーム",
  "社台フアーム",
  "ノーザンファーム",
  "追分ファーム",
  "白老ファーム",
  "社台コーポレーション白老ファーム",
  "社台牧場",
]);
const LAYOFF_DAYS_THRESHOLD = 90;

// pastRaces: 新しい順の過去走配列(先頭が前走)。空/未指定なら新馬戦(デビュー)扱いにする。
export function shadaiLayoffAdjustment(breederName, raceCode, pastRaces) {
  if (!breederName || !SHADAI_GROUP_FARMS.has(breederName.trim())) return null;

  const latest = pastRaces?.[0];
  if (!latest) {
    return { label: "社台系・デビュー", score: 1 }; // 新馬戦は休養明けとして扱う
  }

  const prevDateMs = raceDateMs(latest.race_code);
  const currentDateMs = raceDateMs(raceCode);
  if (prevDateMs == null || currentDateMs == null) return null;
  const daysSince = (currentDateMs - prevDateMs) / 86400000;
  if (daysSince < LAYOFF_DAYS_THRESHOLD) return null;

  return { label: "社台系・休養明け", score: 1 };
}

// レース単位の「乗り捨て」判定。前走に同じ騎手が乗っていた馬が同じレースに複数
// 出走していて、その騎手が今回はどれか1頭だけに継続騎乗し、他の馬には別の騎手が
// 乗る場合、選ばれなかった方の馬を「乗り捨てられた馬」として小さく減点する
// (騎手が複数の依頼の中からあえて選ばなかった、という判断の重みを反映する)。
// raceJockeyContext: 同じレースの全馬について { horseId, jockey, prevJockey } の配列。
export function jockeyAbandonmentAdjustment(horseId, jockey, prevJockey, raceJockeyContext) {
  if (!prevJockey) return null;
  if (jockey === prevJockey) return null; // 自身が継続騎乗なら「乗り捨てられた側」ではない

  const chosenBySameJockey = (raceJockeyContext || []).some(
    (h) => h.horseId !== horseId && h.prevJockey === prevJockey && h.jockey === prevJockey
  );
  if (!chosenBySameJockey) return null;

  return { label: `${prevJockey}乗り捨て`, score: -1 };
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
// 距離適性・血統距離適性の強さの倍率。過去4週末・半年分(1862レース)で
// 0.5倍/1.0倍/1.5倍を比較検証した結果、1.5倍が◎○▲△全てで的中率改善
// (◎73.4%→76.9%等)、穴のみ小幅悪化(35.4%→32.5%)というバランスの良い
// 結果だったため採用。
const APTITUDE_SCALE = 1.5;

export function distanceAptitudeAdjustment(distanceStats, distanceStr) {
  const bucket = distanceBucketKey(distanceStr);
  if (!bucket || !distanceStats) return null;
  const stats = distanceStats[bucket.key];
  if (!stats) return null;

  const starts = sumStats(stats);
  if (starts < 2) return null; // データ不足

  const top3 = stats.chaku1 + stats.chaku2 + stats.chaku3;
  const top3Rate = top3 / starts;
  const rawScore = Math.max(-2, Math.min(3, Math.round((top3Rate - 0.3) * 6)));
  const score = Math.round(rawScore * APTITUDE_SCALE);
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
  const rawScore = Math.max(-2, Math.min(2, Math.round((top3Rate - 0.3) * 5)));
  const score = Math.round(rawScore * APTITUDE_SCALE);
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

// race_code(先頭8桁がYYYYMMDD)から開催日のUTCミリ秒を取り出す。
function raceDateMs(raceCode) {
  if (!raceCode || raceCode.length < 8) return null;
  const y = Number(raceCode.slice(0, 4));
  const m = Number(raceCode.slice(4, 6));
  const d = Number(raceCode.slice(6, 8));
  return Date.UTC(y, m - 1, d);
}

// 過去走の重みは「直近何走目か」ではなく「レース日からの実日数」で決める(半減期60日)。
// 単純な順位ベースだと、3週間おきに使われている馬も半年おきの馬も同じ重みパターンに
// なってしまい、休養明けの文脈が消えてしまう。日数ベースなら間隔が開くほど自然に
// 過去走の重みが下がる。半減期は半年分(1862レース)で60/90/120/150/200日を比較検証し、
// 60日が最も的中率が高かった(全体42.3%→45.0%)ため採用。
const RECENCY_HALF_LIFE_DAYS = 60;

// 直近成績(JV-Data由来。新しい順で最大5走)から基礎スコアを算出する。
// (1)獲得本賞金からその1走の価値を点数化(レースの格・着順の良さを両方反映)、
// (2)レース日が近いほど重みを付ける(半減期60日)、
// (3)上がり3Fが直近ほど速くなっていれば上向きとして加点、
// の3軸で調整する。市場の人気・オッズは意図的に見ない(このアプリの狙いは
// 市場に追従することではなく独自の評価をすることのため)。
// データが無ければ既定値(70)のまま。
export function baseScoreFromPastRaces(pastRaces, currentRaceCode) {
  if (!pastRaces || pastRaces.length === 0) return 70;

  const currentDateMs = raceDateMs(currentRaceCode);
  let weightedSum = 0;
  let weightTotal = 0;
  let sampleCount = 0;

  pastRaces.slice(0, 5).forEach((r) => {
    const finish = Number(r.kakutei_chakujun);
    if (!Number.isFinite(finish) || finish <= 0) return;

    const point = moneyPoint(r.kakutoku_honshokin);

    let weight = 1;
    if (currentDateMs != null) {
      const pastDateMs = raceDateMs(r.race_code);
      const daysAgo = pastDateMs != null ? Math.max(0, (currentDateMs - pastDateMs) / 86400000) : RECENCY_HALF_LIFE_DAYS * 1.5;
      weight = Math.pow(0.5, daysAgo / RECENCY_HALF_LIFE_DAYS);
    }
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
    // v<900: JV-Dataは上がり3Fが未計測の時"999"(=99.9秒)を番兵値として返すため除外する
    .filter((v) => Number.isFinite(v) && v > 0 && v < 900)
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
// ◎○▲はスコア上位固定、△は3位との得点差が僅かな馬(最大4頭まで、僅差の近い順)、
// 穴は機械的に5位固定にせず「得点は低いが加点材料がある馬」の中で最高得点の馬(同点なら全員)に付ける。
// 過去データも補正も無く全馬横並びの時は、枠番順がそのまま印になって紛らわしいため
// 印を一切付けない(noDifferentiation)。
// 新馬戦など全馬が基礎点70前後に団子状態の時、閾値だけだと△が全馬に付いてしまうため、
// 頭数の上限(MAX_TRIANGLE)も設けて絞る。
const TRIANGLE_THRESHOLD = 3;
const MAX_TRIANGLE = 4;

// 印はhorseId(ketto_toroku_bango)を内部キーに計算する。枠番確定前(木曜〜金曜昼)は
// 出走馬の馬番(num)が全馬"00"のまま届くため、numをキーにすると印が衝突して
// 全馬同じ印になってしまう。horseIdは常に一意なのでこの問題が起きない。
// marksByNumは確定済みレース(num重複が起きない)向けに従来通りも返す
// (race_snapshots等、num主キーで保存する既存の仕組みと互換を保つため)。
export function computeMarks(scored) {
  const noDifferentiation = scored.every((h) => !h.hasPastData && h.applied.length === 0);
  if (noDifferentiation) return { marksByNum: {}, marksByHorseId: {}, noDifferentiation };

  const byRank = [...scored].sort((a, b) => a.rank - b.rank);
  const marks = {};
  byRank.slice(0, 3).forEach((h, i) => {
    marks[h.horseId] = MARKS[i];
  });
  const third = byRank[2];
  if (third) {
    let triangleCount = 0;
    byRank.forEach((h) => {
      if (marks[h.horseId] || triangleCount >= MAX_TRIANGLE) return;
      const diff = third.total - h.total;
      if (diff >= 0 && diff <= TRIANGLE_THRESHOLD) {
        marks[h.horseId] = MARKS[3];
        triangleCount += 1;
      }
    });
  }
  const anaCandidates = byRank.filter((h) => !marks[h.horseId] && h.applied.some((a) => a.score > 0));
  if (anaCandidates.length > 0) {
    const bestTotal = Math.max(...anaCandidates.map((h) => h.total));
    anaCandidates.filter((h) => h.total === bestTotal).forEach((h) => {
      marks[h.horseId] = MARKS[4];
    });
  }

  const marksByNum = {};
  byRank.forEach((h) => {
    if (marks[h.horseId]) marksByNum[h.num] = marks[h.horseId];
  });

  return { marksByNum, marksByHorseId: marks, noDifferentiation: false };
}

// 上位馬同士の素点の差(ばらつき)から、大まかな馬券の買い方の方向性を提案する。
// 1位が2位から大きく抜けている(一強)なら軸から流し、上位3頭が僅差(拮抗)ならBOXを勧める。
// 差の大きさでさらに段階分けし、コメントの言い回しにもバリエーションを持たせる。
// 閾値は目安であり、精緻な最適化はしていない。
export function suggestBettingPattern(scored) {
  const byScore = [...scored].sort((a, b) => b.total - a.total);
  if (byScore.length < 3) return null;
  const [first, second, third] = byScore;
  const gapTop2 = first.total - second.total;
  const gapTop3 = first.total - third.total;

  if (gapTop2 >= 10) {
    return {
      pattern: "一強",
      label: `◎が圧倒的(2位と${gapTop2}点差)`,
      detail: "頭数を絞った単勝・複勝や、◎軸の3連単1着固定が合いそう",
    };
  }
  if (gapTop2 >= 6) {
    return {
      pattern: "一強",
      label: `◎から流し(2位と${gapTop2}点差)`,
      detail: "◎が頭一つ抜けているので、◎軸の馬連・3連複流しが合いそう",
    };
  }
  if (gapTop3 <= 1) {
    return {
      pattern: "拮抗",
      label: `上位3頭がほぼ横並び(${gapTop3}点差)`,
      detail: "実力差がほぼ無いので、◎○▲での3連複BOXが合いそう",
    };
  }
  if (gapTop3 <= 3) {
    return {
      pattern: "拮抗",
      label: `上位3頭が接戦(${gapTop3}点差)`,
      detail: "上位が僅差なので、◎○▲でのBOX買いが合いそう",
    };
  }
  return {
    pattern: "標準",
    label: "◎○▲に厚め、△穴は抑えで",
    detail: "上位と下位でそれなりに差があるので、点数を絞った手厚い買い方が合いそう",
  };
}
