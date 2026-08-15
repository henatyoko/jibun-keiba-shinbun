// 属性ルール・傾向ルールを1頭の馬に適用し、合計スコアを算出する。
export function scoreHorse(horse, attrRules, trendRules, raceName) {
  const applied = [];

  attrRules.forEach((rule) => {
    if (
      (rule.type === "血統" && horse.sire === rule.value) ||
      (rule.type === "騎手" && horse.jockey === rule.value)
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

// 直近成績(着順)から基礎スコアを算出する簡易ロジック。
// 1着ほど加点、着外ほど減点。データが無ければ既定値(70)のまま。
export function baseScoreFromPastRaces(pastRaces) {
  if (!pastRaces || pastRaces.length === 0) return 70;

  const points = pastRaces.map((r) => {
    if (!r.finish_position) return 0;
    if (r.finish_position === 1) return 8;
    if (r.finish_position <= 3) return 4;
    if (r.finish_position <= 5) return 1;
    return -2;
  });

  const avg = points.reduce((sum, p) => sum + p, 0) / points.length;
  return Math.round(70 + avg * 3);
}
