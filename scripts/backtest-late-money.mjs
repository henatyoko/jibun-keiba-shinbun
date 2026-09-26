// 「締切直前に大口が入ってオッズが急落した馬はよく勝つのか」を、JRA-VANの時系列オッズ(0B41)で検証する。
// 入力は scripts/vps/Fetch-JikeiretsuOdds.ps1 が書き出したCSV。着順はSupabaseから取る。
//
//   node scripts/backtest-late-money.mjs path/to/jikeiretsu_tansho.csv [--ref 10] [--close 2]
//
//   --ref   比較の基準にする時点(発走の何分前のオッズと比べるか。既定10分前)
//   --close 馬券を買える最後の時点(JRAの発売締切は発走2分前)
//
// 見るのは2つ:
//   A. 締切前に見えていた急落(基準時点 → 締切時点) … 実際に「ウォッチして買う」ことができる動き
//   B. 締切後の急落(締切時点 → 確定オッズ) … 買えないが、「直前に大口→勝つ」の正体がこちらかを確認する

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const REF_MIN = opt("ref", 10);
const CLOSE_MIN = opt("close", 2);

if (!csvPath) {
  console.error("使い方: node scripts/backtest-late-money.mjs <jikeiretsu_tansho.csv> [--ref 10] [--close 2]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// --- CSV読み込み: race_code -> umaban -> [{t, kubun, odds}] ---
const series = new Map();
readFileSync(csvPath, "utf8")
  .split(/\r?\n/)
  .slice(1)
  .forEach((line) => {
    const [raceCode, kubun, happyo, umaban, odds] = line.split(",");
    if (!raceCode || !odds) return;
    if (!series.has(raceCode)) series.set(raceCode, new Map());
    const byHorse = series.get(raceCode);
    if (!byHorse.has(umaban)) byHorse.set(umaban, []);
    byHorse.get(umaban).push({ happyo, kubun, odds: Number(odds) });
  });
const raceCodes = [...series.keys()];
console.log(`時系列オッズ: ${raceCodes.length}レース`);

// --- 発走時刻と勝ち馬をSupabaseから取得 ---
const postTimeByRace = new Map();
const winnersByRace = new Map();
for (let i = 0; i < raceCodes.length; i += 200) {
  const chunk = raceCodes.slice(i, i + 200);
  const [{ data: races, error: e1 }, { data: winners, error: e2 }] = await Promise.all([
    supabase.from("race_shosai").select("race_code, hasso_jikoku").in("race_code", chunk),
    supabase.from("umagoto_race_joho").select("race_code, umaban").in("race_code", chunk).eq("kakutei_chakujun", "01"),
  ]);
  if (e1 || e2) throw e1 || e2;
  races.forEach((r) => postTimeByRace.set(r.race_code, r.hasso_jikoku));
  winners.forEach((w) => {
    if (!winnersByRace.has(w.race_code)) winnersByRace.set(w.race_code, new Set());
    winnersByRace.get(w.race_code).add(w.umaban);
  });
}

const toMinutes = (year, mmdd, hhmm) =>
  Date.UTC(year, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(2, 4)), Number(hhmm.slice(0, 2)), Number(hhmm.slice(2, 4))) / 60000;

// --- 馬ごとに 基準時点 / 締切時点 / 確定 のオッズを取り出す ---
const horses = [];
let skipped = 0;
let snapshotGaps = [];
for (const [raceCode, byHorse] of series) {
  const hasso = postTimeByRace.get(raceCode);
  const winners = winnersByRace.get(raceCode);
  if (!hasso || hasso === "0000" || !winners) {
    skipped++;
    continue;
  }
  const year = Number(raceCode.slice(0, 4));
  const post = toMinutes(year, raceCode.slice(4, 8), hasso);

  const raceHorses = [];
  for (const [umaban, snaps] of byHorse) {
    const withTime = snaps
      .map((s) => ({ ...s, before: post - toMinutes(year, s.happyo.slice(0, 4), s.happyo.slice(4, 8)) }))
      .sort((a, b) => b.before - a.before);
    const intermediate = withTime.filter((s) => s.kubun === "1" || s.kubun === "2");
    const finals = withTime.filter((s) => ["3", "4", "5"].includes(s.kubun));
    const atOrBefore = (min) => intermediate.filter((s) => s.before >= min).at(-1);
    const ref = atOrBefore(REF_MIN);
    const close = atOrBefore(CLOSE_MIN);
    const final = finals.at(-1) ?? withTime.at(-1);
    if (!ref || !close || !final || ref === close) continue;
    raceHorses.push({
      raceCode,
      umaban,
      ref: ref.odds,
      close: close.odds,
      final: final.odds,
      closeBefore: close.before,
      won: winners.has(umaban),
    });
  }
  if (raceHorses.length === 0) {
    skipped++;
    continue;
  }
  snapshotGaps.push(raceHorses[0].closeBefore);
  // レース内で基準→締切の下落率が最も大きかった馬に印を付ける
  const biggest = raceHorses.reduce((a, b) => (b.close / b.ref < a.close / a.ref ? b : a));
  biggest.biggestDropInRace = true;
  horses.push(...raceHorses);
}

snapshotGaps.sort((a, b) => a - b);
const usedRaces = new Set(horses.map((h) => h.raceCode)).size;
console.log(`分析対象: ${usedRaces}レース / ${horses.length}頭 (発走時刻・着順が無いなどで除外: ${skipped}レース)`);
console.log(`「締切時点」として使えた最後のオッズは、発走の中央値${snapshotGaps[Math.floor(snapshotGaps.length / 2)] ?? "?"}分前\n`);

// 単勝100円を全頭買ったときの成績。期待勝率は確定オッズから逆算した市場の見立て(控除率20%込み)
function summarize(label, list) {
  const n = list.length;
  if (n === 0) return { label, 頭数: 0 };
  const wins = list.filter((h) => h.won);
  const payout = wins.reduce((s, h) => s + h.final * 100, 0);
  const implied = list.reduce((s, h) => s + 0.8 / h.final, 0) / n;
  return {
    label,
    頭数: n,
    勝率: `${((wins.length / n) * 100).toFixed(1)}%`,
    市場の期待勝率: `${(implied * 100).toFixed(1)}%`,
    単回収率: `${((payout / (n * 100)) * 100).toFixed(0)}%`,
  };
}

const drop = (h, from, to) => 1 - h[to] / h[from];
const THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.5];
const BANDS = [
  ["全体", () => true],
  ["基準時1〜4.9倍", (h) => h.ref < 5],
  ["基準時5〜9.9倍", (h) => h.ref >= 5 && h.ref < 10],
  ["基準時10〜29.9倍", (h) => h.ref >= 10 && h.ref < 30],
  ["基準時30倍以上", (h) => h.ref >= 30],
];

console.log(`=== A. 締切前に見えた急落 (発走${REF_MIN}分前 → 締切時点) … 買える ===`);
for (const [bandLabel, inBand] of BANDS) {
  const band = horses.filter(inBand);
  console.log(`\n[${bandLabel}]`);
  console.table([
    summarize("全馬(比較用)", band),
    ...THRESHOLDS.map((t) => summarize(`${t * 100}%以上下落`, band.filter((h) => drop(h, "ref", "close") >= t))),
    summarize("レース内で一番下がった馬", band.filter((h) => h.biggestDropInRace)),
  ]);
}

console.log(`\n=== B. 締切後の急落 (締切時点 → 確定オッズ) … 買えない。噂の正体の確認用 ===`);
console.table([
  summarize("全馬(比較用)", horses),
  ...THRESHOLDS.map((t) => summarize(`${t * 100}%以上下落`, horses.filter((h) => drop(h, "close", "final") >= t))),
]);
