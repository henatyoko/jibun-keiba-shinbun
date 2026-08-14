// レトロ新聞風カラートークン
export const PAPER = "#F1E9D8";
export const PAPER_CARD = "#F8F2E4";
export const INK = "#2B2622";
export const RED = "#A9342A";
export const MUTED = "#7A7166";
export const LINE = "#2B2622";
// PC表示時の左右余白用、紙色を暗くしたブラウン
export const GUTTER = "#5C4A3A";

// 予想印(競馬新聞の伝統的な記号)
export const MARKS = ["◎", "○", "▲", "△", "穴"];

// 枠番カラー
export const WAKU_COLORS = {
  1: { bg: "#F8F2E4", text: INK, border: INK },
  2: { bg: INK, text: PAPER, border: INK },
  3: { bg: RED, text: PAPER, border: RED },
  4: { bg: "#3A5A7A", text: PAPER, border: "#3A5A7A" },
  5: { bg: "#C9A227", text: INK, border: "#C9A227" },
  6: { bg: "#3E6B4E", text: PAPER, border: "#3E6B4E" },
  7: { bg: "#B5651D", text: PAPER, border: "#B5651D" },
  8: { bg: "#A5507A", text: PAPER, border: "#A5507A" },
};

// PC表示時、中央カラムの左右の暗い余白に敷く馬柄パターン(将棋の駒風の馬アイコンを散らす)
const HORSE_TILE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>
  <text x='0' y='95' font-size='90' font-family='serif' fill='${PAPER}'>♞</text>
  <text x='115' y='205' font-size='90' font-family='serif' fill='${PAPER}'>♞</text>
</svg>`;
export const HORSE_PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(HORSE_TILE_SVG)}")`;
