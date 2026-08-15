// 競馬場・馬場・距離ごとの「枠順(内枠/外枠)有利不利」の一般的な傾向。
// ユーザー個人の知見ではなく、公開されている統計・分析記事から集めた一般論のため
// (ユーザーの独自ルールと違いここに直接コード化している)、あくまで参考程度の
// 小さな補正として使う。異論があればユーザー自身の傾向ルールで上書き・追加できる。
//
// wakuBonus(waku): 枠番(1〜8)を受け取り、有利なら正・不利なら負の小さな値を返す。
export const COURSE_BIAS = [
  {
    place: "新潟",
    surface: "芝",
    minDistance: 1000,
    maxDistance: 1000,
    label: "新潟芝1000m(直線)は外枠有利",
    wakuBonus: (waku) => (waku >= 7 ? 3 : waku >= 5 ? 1 : waku <= 2 ? -2 : 0),
  },
  {
    place: "新潟",
    surface: "芝",
    minDistance: 1200,
    maxDistance: 1200,
    label: "新潟芝1200mは最内枠がやや不利",
    wakuBonus: (waku) => (waku === 1 ? -2 : waku >= 4 && waku <= 6 ? 1 : 0),
  },
  {
    place: "新潟",
    surface: "芝",
    minDistance: 1600,
    maxDistance: 1600,
    label: "新潟芝1600mは内枠が不振、5枠付近が良好",
    wakuBonus: (waku) => (waku === 5 ? 1 : waku <= 2 ? -1 : 0),
  },
  {
    place: "新潟",
    surface: "芝",
    minDistance: 1800,
    maxDistance: 2000,
    label: "新潟芝(外回り)は内枠有利",
    wakuBonus: (waku) => (waku <= 2 ? 2 : waku >= 7 ? -1 : 0),
  },
  {
    place: "新潟",
    surface: "ダ",
    minDistance: 1200,
    maxDistance: 1200,
    label: "新潟ダート1200mは外寄り(逃げ・先行)有利",
    wakuBonus: (waku) => (waku >= 6 ? 2 : waku === 1 ? -1 : 0),
  },
  {
    place: "中京",
    surface: "芝",
    minDistance: 1200,
    maxDistance: 1200,
    label: "中京芝1200mは内枠有利",
    wakuBonus: (waku) => (waku <= 2 ? 2 : waku >= 7 ? -1 : 0),
  },
  {
    place: "中京",
    surface: "芝",
    minDistance: 2000,
    maxDistance: 2000,
    label: "中京芝2000mは最内枠がやや不利、中間枠が動きやすい",
    wakuBonus: (waku) => (waku === 1 ? -2 : waku >= 3 && waku <= 6 ? 1 : 0),
  },
  {
    place: "東京",
    surface: "芝",
    minDistance: 1400,
    maxDistance: 1400,
    label: "東京芝1400mは外枠有利",
    wakuBonus: (waku) => (waku >= 6 ? 2 : waku <= 2 ? -1 : 0),
  },
  {
    place: "東京",
    surface: "芝",
    minDistance: 1600,
    maxDistance: 1600,
    label: "東京芝1600mは1枠・7枠が有利",
    wakuBonus: (waku) => (waku === 1 || waku === 7 ? 2 : 0),
  },
  {
    place: "東京",
    surface: "芝",
    minDistance: 1800,
    maxDistance: 1800,
    label: "東京芝1800mは中内枠(4枠付近)が有利",
    wakuBonus: (waku) => (waku === 4 ? 2 : waku === 3 || waku === 5 ? 1 : 0),
  },
  {
    place: "東京",
    surface: "芝",
    minDistance: 2400,
    maxDistance: 2400,
    label: "東京芝2400mは内枠有利",
    wakuBonus: (waku) => (waku === 1 ? 2 : waku <= 3 ? 1 : waku >= 7 ? -1 : 0),
  },
  {
    place: "東京",
    surface: "ダ",
    minDistance: 1300,
    maxDistance: 1300,
    label: "東京ダート1300mは内枠有利",
    wakuBonus: (waku) => (waku === 1 ? 2 : waku <= 2 ? 1 : 0),
  },
  {
    place: "東京",
    surface: "ダ",
    minDistance: 1600,
    maxDistance: 1600,
    label: "東京ダート1600mは外枠有利",
    wakuBonus: (waku) => (waku === 8 ? 2 : waku >= 6 ? 1 : 0),
  },
];

export function courseBiasFor(place, surface, distanceMeters) {
  return (
    COURSE_BIAS.find(
      (c) =>
        c.place === place &&
        c.surface === surface &&
        distanceMeters >= c.minDistance &&
        distanceMeters <= c.maxDistance
    ) ?? null
  );
}
