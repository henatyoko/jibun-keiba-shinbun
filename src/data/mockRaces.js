// モックのレース・出走馬データ。
// 実データ移行時は fetchRaces() の中身を差し替えるだけでよいよう、
// このファイルはデータの「形」の参考としてのみ扱うこと。
export const MOCK_RACES = [
  {
    id: "r1",
    grade: "G1",
    name: "秋空ステークス",
    place: "東京",
    distance: "芝2400m",
    date: "10/25(日) 15:40",
    horses: [
      { num: 3, waku: 3, name: "サンライズウィン", sire: "キズナ", jockey: "M.タカハシ", age: 4, base: 78 },
      { num: 8, waku: 8, name: "コスモブレイズ", sire: "ディープ系", jockey: "K.ササキ", age: 3, base: 82 },
      { num: 5, waku: 5, name: "フェアリーテイル", sire: "キズナ", jockey: "R.ヤマモト", age: 5, base: 71 },
      { num: 1, waku: 1, name: "グランドクレスト", sire: "ロード系", jockey: "M.タカハシ", age: 6, base: 65 },
    ],
  },
  {
    id: "r2",
    grade: "重賞",
    name: "菊花の道賞",
    place: "京都",
    distance: "芝3000m",
    date: "10/26(月) 15:25",
    horses: [
      { num: 2, waku: 2, name: "ノーブルレイン", sire: "ハーツ系", jockey: "K.ササキ", age: 3, base: 75 },
      { num: 7, waku: 7, name: "ミッドナイトブルー", sire: "キズナ", jockey: "R.ヤマモト", age: 3, base: 69 },
      { num: 4, waku: 4, name: "ヴィクトリーロード", sire: "ディープ系", jockey: "T.イノウエ", age: 4, base: 80 },
    ],
  },
];
