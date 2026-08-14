export const ATTR_TYPES = ["血統", "騎手", "厩舎"];
export const TREND_TYPES = ["馬齢", "枠番", "脚質"];

export const INITIAL_ATTR_RULES = [
  { id: "a1", type: "血統", value: "キズナ", score: 3 },
  { id: "a2", type: "騎手", value: "M.タカハシ", score: 2 },
];

export const INITIAL_TREND_RULES = [
  { id: "t1", race: "菊花の道賞", type: "馬齢", value: "3歳", score: -5, label: "3歳馬は来ない" },
  { id: "t2", race: "秋空ステークス", type: "枠番", value: "8枠以降", score: 3, label: "外枠が来やすい" },
];
