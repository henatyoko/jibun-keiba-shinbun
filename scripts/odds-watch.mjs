// 開催日にMac上で動かし、JRA各レースの発走前だけnetkeibaの単勝オッズを定期取得して、
// 「締切直前に大口が入った馬」「オッズが急落した馬」をターミナル表示+Macの通知で知らせる。
//
//   npm run odds-watch                      … 今日の全レースを監視
//   npm run odds-watch -- --race 202606040811  … 1レースだけ今すぐ監視(動作確認用)
//
// オプション:
//   --min-yen 1000000  1回の更新でこの金額以上が1頭に入ったら「大口」扱い(既定100万円)
//   --drop 0.25        約10分前と比べてオッズがこの割合以上下がったら「急落」扱い(既定25%)
//   --window 20        発走何分前から監視を始めるか(既定20分)
//
// 馬ごとの投票額はnetkeibaが返す単勝票数(h_tansho)とオッズからの推定値。
// 取得したオッズは odds-watch-data/YYYYMMDD.csv に残す(あとで「本当に勝つのか」を検証する材料)。
//
// 注意: netkeibaの利用規約上、私的利用の範囲を超える利用は禁止されている。
// 本人の私的利用のため、発走前の限られた時間だけ・1レースにつき1分(直前は30秒)間隔でのみ取得する。

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const MIN_YEN = Number(opt("min-yen", 1_000_000));
const DROP = Number(opt("drop", 0.25));
const WINDOW_MIN = Number(opt("window", 20));
const SINGLE_RACE = opt("race", null);

const HEADERS = {
  "User-Agent": "jibun-keiba-shinbun-scraper/1.0 (personal, low-frequency, private use)",
};
const PLACES = {
  "01": "札幌", "02": "函館", "03": "福島", "04": "新潟", "05": "東京",
  "06": "中山", "07": "中京", "08": "京都", "09": "阪神", "10": "小倉",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
const now = () => new Date();
const hhmmss = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const man = (yen) => `${Math.round(yen / 10000).toLocaleString()}万円`;

function todayStr() {
  const d = now();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// --- 今日のレース一覧(レースID・発走時刻・レース名)をnetkeibaから取得 ---
async function fetchTodayRaces(kaisaiDate) {
  const listRes = await fetch(
    `https://race.netkeiba.com/top/race_list_get_date_list.html?kaisai_date=${kaisaiDate}&encoding=UTF-8`,
    { headers: HEADERS }
  );
  const group = cheerio.load(await listRes.text())(`li[date="${kaisaiDate}"]`).first().attr("group");
  if (!group) return [];

  await sleep(1000);
  const res = await fetch(
    `https://race.netkeiba.com/top/race_list_sub.html?kaisai_date=${kaisaiDate}&current_group=${group}`,
    { headers: HEADERS }
  );
  const $ = cheerio.load(await res.text());
  const races = [];
  $("li.RaceList_DataItem").each((_, li) => {
    const href = $(li).find('a[href*="race_id="]').first().attr("href") || "";
    const id = href.match(/race_id=(\d{12})/)?.[1];
    const time = $(li).find(".RaceList_Itemtime").text().trim();
    if (!id || !/^\d{1,2}:\d{2}$/.test(time)) return;
    const [h, m] = time.split(":").map(Number);
    const post = now();
    post.setHours(h, m, 0, 0);
    races.push({
      id,
      label: `${PLACES[id.slice(4, 6)] ?? id.slice(4, 6)}${Number(id.slice(10, 12))}R`,
      name: $(li).find(".ItemTitle").text().trim(),
      post,
    });
  });
  return races.sort((a, b) => a.post - b.post);
}

// 馬名はnetkeibaスクレイパーが保存しているrace_entriesから(無ければ馬番だけで表示)
async function fetchHorseNames(raceIds) {
  try {
    const env = Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
    );
    const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    const { data } = await supabase.from("race_entries").select("race_id, num, horse_name").in("race_id", raceIds);
    return new Map((data || []).map((e) => [`${e.race_id}_${pad(e.num)}`, e.horse_name]));
  } catch {
    return new Map();
  }
}

// --- 単勝オッズ1回分を取得 ---
// 返り値: { at: 公式発表時刻, pool: 単勝発売額(円), horses: {馬番: {odds, ninki, est}} }
async function fetchOdds(raceId) {
  const res = await fetch(
    `https://race.netkeiba.com/api/api_get_jra_odds.html?race_id=${raceId}&type=1&action=update`,
    { headers: HEADERS }
  );
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const data = json?.data;
  const tansho = data?.odds?.["1"];
  if (!tansho || !data.h_tansho) return null;

  const horses = {};
  for (const [umaban, [odds, , ninki]] of Object.entries(tansho)) {
    const o = Number(odds);
    if (o > 0) horses[umaban] = { odds: o, ninki: Number(ninki) };
  }
  // 各馬の投票額 ≒ 単勝発売額 × (1/オッズ) / Σ(1/オッズ)  (控除率に依らない形で按分)
  const pool = Number(data.h_tansho) * 100;
  const invSum = Object.values(horses).reduce((s, h) => s + 1 / h.odds, 0);
  for (const h of Object.values(horses)) h.est = (pool * (1 / h.odds)) / invSum;
  return { at: data.official_datetime, status: json.status, pool, horses };
}

function notify(title, message) {
  if (process.platform !== "darwin") return;
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  execFile("osascript", ["-e", `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`]);
}

// --- 前回・約10分前のスナップショットと比べて、大口/急落を検出 ---
function detect(race, prev, cur) {
  const alerts = [];
  const poolIn = cur.pool - prev.pool;
  const tenMinAgo = race.snaps.filter((s) => new Date(cur.at) - new Date(s.at) >= 9 * 60 * 1000).at(-1);

  for (const [umaban, h] of Object.entries(cur.horses)) {
    const p = prev.horses[umaban];
    if (!p) continue;
    const inflow = h.est - p.est;
    const prevShare = p.est / prev.pool;
    // 大口: 一定額以上が入り、しかもそれまでの人気の割合(=普段入る割合)の2倍以上を1頭が吸った
    if (poolIn > 0 && inflow >= MIN_YEN && inflow / poolIn >= prevShare * 2) {
      alerts.push({
        umaban,
        text: `大口 +${man(inflow)} (この間の単勝売上の${Math.round((inflow / poolIn) * 100)}%) ${p.odds}→${h.odds}倍`,
      });
    }
    const base = tenMinAgo?.horses[umaban];
    if (base && 1 - h.odds / base.odds >= DROP && !race.dropAlerted.has(umaban)) {
      race.dropAlerted.add(umaban);
      alerts.push({
        umaban,
        text: `急落 ${base.odds}→${h.odds}倍 (約10分で${Math.round((1 - h.odds / base.odds) * 100)}%下落)`,
      });
    }
  }
  return alerts;
}

function logCsv(race, snap) {
  if (!existsSync("odds-watch-data")) mkdirSync("odds-watch-data");
  const file = `odds-watch-data/${todayStr()}.csv`;
  if (!existsSync(file)) appendFileSync(file, "race_id,post_time,official_datetime,status,tansho_pool_yen,umaban,odds,ninki\n");
  const post = `${pad(race.post.getHours())}:${pad(race.post.getMinutes())}`;
  const rows = Object.entries(snap.horses).map(
    ([u, h]) => `${race.id},${post},${snap.at},${snap.status},${snap.pool},${u},${h.odds},${h.ninki}`
  );
  appendFileSync(file, rows.join("\n") + "\n");
}

function printBoard(race, snap, names) {
  const minsLeft = ((race.post - now()) / 60000).toFixed(1);
  const first = race.snaps[0];
  const movers = Object.entries(snap.horses)
    .map(([u, h]) => ({ u, h, gain: h.est - (first.horses[u]?.est ?? h.est), from: first.horses[u]?.odds }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3)
    .map(({ u, h, gain, from }) => `${u}${names.get(`${race.id}_${u}`) ?? ""} ${from}→${h.odds}倍(+${man(gain)})`);
  console.log(
    `${hhmmss(now())} ${race.label} ${race.name} 発走まで${minsLeft}分 単勝売上${man(snap.pool)} | 監視開始から多く入った馬: ${movers.join(" / ")}`
  );
}

async function poll(race, names) {
  const snap = await fetchOdds(race.id);
  if (!snap) return;
  const prev = race.snaps.at(-1);
  if (prev?.at === snap.at) return; // 公式オッズが更新されていない
  race.snaps.push(snap);
  logCsv(race, snap);
  if (!prev) {
    console.log(`${hhmmss(now())} ${race.label} ${race.name} 監視開始`);
    return;
  }
  printBoard(race, snap, names);
  for (const a of detect(race, prev, snap)) {
    const name = names.get(`${race.id}_${a.umaban}`) ?? "";
    const line = `【${race.label}】${a.umaban}番${name} ${a.text}`;
    console.log(`\x1b[41m\x1b[97m ${line} \x1b[0m`);
    notify(`${race.label} ${race.name}`, `${a.umaban}番${name} ${a.text}`);
  }
}

async function main() {
  let races;
  if (SINGLE_RACE) {
    const post = now();
    post.setMinutes(post.getMinutes() + 10);
    races = [{ id: SINGLE_RACE, label: `${PLACES[SINGLE_RACE.slice(4, 6)] ?? ""}${Number(SINGLE_RACE.slice(10, 12))}R`, name: "(動作確認)", post }];
  } else {
    races = await fetchTodayRaces(todayStr());
  }
  if (races.length === 0) {
    console.log("今日のJRAレースが見つかりませんでした");
    return;
  }
  const names = await fetchHorseNames(races.map((r) => r.id));
  races.forEach((r) => Object.assign(r, { snaps: [], dropAlerted: new Set(), lastPoll: 0, done: false }));
  console.log(
    `${races.length}レースを監視します(発走${WINDOW_MIN}分前から / 大口=${man(MIN_YEN)}以上 / 急落=${DROP * 100}%以上)。Ctrl+Cで終了\n`
  );

  while (races.some((r) => !r.done)) {
    for (const race of races) {
      if (race.done) continue;
      const minsLeft = (race.post - now()) / 60000;
      if (minsLeft > WINDOW_MIN) continue;
      if (minsLeft < -3) {
        // 発走後に確定寸前のオッズをもう1回だけ残して終了
        await poll(race, names);
        race.done = true;
        console.log(`${hhmmss(now())} ${race.label} 監視終了`);
        continue;
      }
      const interval = minsLeft <= 5 ? 30_000 : 60_000;
      if (Date.now() - race.lastPoll < interval) continue;
      race.lastPoll = Date.now();
      await poll(race, names).catch((e) => console.error(`${race.label} 取得失敗: ${e.message}`));
      await sleep(1000);
    }
    await sleep(5000);
  }
  console.log("今日の監視はすべて終了しました");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
