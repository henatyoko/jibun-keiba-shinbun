// JRA-VAN JV-Data公式コード表(2001.競馬場コード/2003.グレードコード/2005.競走種別コード/
// 2007.競走条件コード/2009.トラックコード)より。値はJRA-VANのSDK付属コード表(JV-Data*.xls)で確認済み。

export const PLACE_NAMES = {
  "01": "札幌",
  "02": "函館",
  "03": "福島",
  "04": "新潟",
  "05": "東京",
  "06": "中山",
  "07": "中京",
  "08": "京都",
  "09": "阪神",
  "10": "小倉",
};

const GRADE_CODE_LABELS = {
  A: "G1",
  B: "G2",
  C: "G3",
  D: "重賞",
  E: "特別", // 重賞以外の特別競走。実際のバッジ表示ではクラス名を優先する
  F: "JG1",
  G: "JG2",
  H: "JG3",
};

const SHUBETSU_AGE_LABELS = {
  "11": "2歳",
  "12": "3歳",
  "13": "3歳以上",
  "14": "4歳以上",
  "18": "障害3歳以上",
  "19": "障害4歳以上",
};

const JOKEN_LABELS = {
  "701": "新馬",
  "702": "未出走",
  "703": "未勝利",
  "005": "1勝クラス",
  "010": "2勝クラス",
  "016": "3勝クラス",
  "999": "オープン",
};

function jokenLabel(code) {
  if (!code || code === "000") return null;
  if (JOKEN_LABELS[code]) return JOKEN_LABELS[code];
  // 上記以外(過去の賞金クラスなど)は額面から概算表示にフォールバックする
  const man = Number(code);
  return Number.isFinite(man) && man > 0 ? `${man}00万円以下` : null;
}

// 5歳以上・最若年など複数の条件フィールドのうち、値が入っているものを使う
function pickJokenCode(race) {
  return (
    [
      race.kyoso_joken_code_2sai,
      race.kyoso_joken_code_3sai,
      race.kyoso_joken_code_4sai,
      race.kyoso_joken_code_5sai_ijo,
      race.kyoso_joken_code_saijakunen,
    ].find((c) => c && c !== "000") || null
  );
}

// 表示用のグレードバッジ("G1"〜"G3"、または"未勝利"などのクラス名、それ以外は"一般")
export function gradeBadge(race) {
  const graded = GRADE_CODE_LABELS[race.grade_code];
  if (graded && !["重賞", "特別"].includes(graded)) return graded;
  const joken = jokenLabel(pickJokenCode(race));
  if (race.kyosomei_hondai && joken) return joken;
  return "一般";
}

// レース名(冠名が無い条件戦は「3歳以上1勝クラス」のような形に組み立てる)
export function raceTitle(race) {
  if (race.kyosomei_hondai) return race.kyosomei_hondai;
  const age = SHUBETSU_AGE_LABELS[race.kyoso_shubetsu_code] || "";
  const joken = jokenLabel(pickJokenCode(race)) || "";
  return `${age}${joken}`.trim() || "競走";
}

// トラックコード(10-22:芝, 23-29:ダート, 51-59:障害)から距離表示文字列を作る
export function distanceLabel(trackCode, kyori) {
  const n = Number(trackCode);
  const prefix = n >= 51 ? "障" : n >= 23 ? "ダ" : "芝";
  return `${prefix}${kyori}m`;
}
