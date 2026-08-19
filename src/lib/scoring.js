import { courseBiasFor } from "../data/courseBias";

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

// 直近成績(JV-Data由来。新しい順で最大5走)から基礎スコアを算出する。
// 着順に加えて、(1)直近ほど重みを付ける、(2)人気より着順が良ければ加点/悪ければ減点、
// (3)上がり3Fが直近ほど速くなっていれば上向きとして加点、の3軸で調整する。
// データが無ければ既定値(70)のまま。
export function baseScoreFromPastRaces(pastRaces) {
  if (!pastRaces || pastRaces.length === 0) return 70;

  const RECENCY_WEIGHTS = [5, 4, 3, 2, 1];
  let weightedSum = 0;
  let weightTotal = 0;

  pastRaces.slice(0, 5).forEach((r, i) => {
    const finish = Number(r.kakutei_chakujun);
    if (!Number.isFinite(finish) || finish <= 0) return;

    let point = finish === 1 ? 8 : finish <= 3 ? 4 : finish <= 5 ? 1 : -2;

    const ninki = Number(r.tansho_ninkijun);
    if (Number.isFinite(ninki) && ninki > 0) {
      // 人気より着順が良い(gap>0)ほど加点、人気に届かないほど減点。±3点まで。
      const gap = ninki - finish;
      point += Math.max(-3, Math.min(3, gap * 0.5));
    }

    const weight = RECENCY_WEIGHTS[i] ?? 1;
    weightedSum += point * weight;
    weightTotal += weight;
  });

  if (weightTotal === 0) return 70;
  let avg = weightedSum / weightTotal;

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
