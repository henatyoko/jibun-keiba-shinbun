// 開催日にMac上で動かし、JRA各レースの発走前だけnetkeibaの単勝オッズを定期取得して、
// 「締切直前に大口が入った馬」「オッズが急落した馬」をブラウザ画面+Macの通知で知らせる。
//
//   npm run odds-watch                      … 今日の全レースを監視(ブラウザで http://localhost:5178 が開く)
//   npm run odds-watch -- --race 202606040811  … 1レースだけ今すぐ監視(動作確認用)
//
// オプション:
//   --min-yen 1000000  1回の更新でこの金額以上が1頭に入ったら「大口」扱い(既定100万円)
//   --drop 0.25        約10分前と比べてオッズがこの割合以上下がったら「急落」扱い(既定25%)
//   --slide 0.2        締切前の約10分間でオッズが下がり続け、この割合以上下がったら「じわじわ下落」扱い(既定20%)
//   --window 20        発走何分前から監視を始めるか(既定20分)
//   --port 5178        画面のポート番号
//   --no-open          起動時にブラウザを自動で開かない
//
// JRAの発売締切は発走2分前。公式発表時刻が締切より前のアラートだけが「締切前(買える)」で、
// Macの通知はそれだけに出す。締切後に分かった動きは画面に「締切後」として残す。
//
// 馬ごとの投票額はnetkeibaが返す単勝票数(h_tansho)とオッズからの推定値。
// 取得したオッズは odds-watch-data/YYYYMMDD.csv に残す(あとで「本当に勝つのか」を検証する材料)。
// 途中で止めて起動し直しても、当日分はこのCSVから復元する。
//
// 注意: netkeibaの利用規約上、私的利用の範囲を超える利用は禁止されている。
// 本人の私的利用のため、発走前の限られた時間だけ・1レースにつき1分(直前は30秒)間隔でのみ取得する。

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const MIN_YEN = Number(opt("min-yen", 1_000_000));
const DROP = Number(opt("drop", 0.25));
const SLIDE = Number(opt("slide", 0.2));
const CLOSE_BEFORE_POST_MIN = 2;
const WINDOW_MIN = Number(opt("window", 20));
const PORT = Number(opt("port", 5178));
const SINGLE_RACE = opt("race", null);
const AUTO_OPEN = !args.includes("--no-open");

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
const CSV_FILE = `odds-watch-data/${todayStr()}.csv`;

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
    races.push({ id, label: raceLabel(id), name: $(li).find(".ItemTitle").text().trim(), post });
  });
  return races.sort((a, b) => a.post - b.post);
}

const raceLabel = (id) => `${PLACES[id.slice(4, 6)] ?? id.slice(4, 6)}${Number(id.slice(10, 12))}R`;

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

// 各馬の投票額 ≒ 単勝発売額 × (1/オッズ) / Σ(1/オッズ)  (控除率に依らない形で按分)
function addEstimates(horses, pool) {
  const invSum = Object.values(horses).reduce((s, h) => s + 1 / h.odds, 0);
  for (const h of Object.values(horses)) h.est = (pool * (1 / h.odds)) / invSum;
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
  const pool = Number(data.h_tansho) * 100;
  addEstimates(horses, pool);
  return { at: data.official_datetime, status: json.status, pool, horses };
}

function notify(title, message) {
  if (process.platform !== "darwin") return;
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  execFile("osascript", ["-e", `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`]);
}

// netkeibaの公式発表時刻("2026-09-26 12:25:10")はローカル時刻
const parseAt = (at) => new Date(at.replace(" ", "T"));
const closeTime = (race) => new Date(race.post.getTime() - CLOSE_BEFORE_POST_MIN * 60 * 1000);

// 締切前に、直近約10分の最高値からSLIDE以上下がり、しかも直近3回の更新で一度も上がっていない(=下がり続けている)
function detectSlide(race, cur, umaban) {
  if (race.slideAlerted.has(umaban)) return null;
  const window = race.snaps.filter((s) => parseAt(cur.at) - parseAt(s.at) <= 10 * 60 * 1000 && s.horses[umaban]);
  const series = window.map((s) => s.horses[umaban].odds);
  if (series.length < 4) return null;
  const peak = Math.max(...series);
  const nowOdds = series.at(-1);
  const lastSteps = series.slice(-4);
  const stillFalling = lastSteps.every((o, i) => i === 0 || o <= lastSteps[i - 1]) && nowOdds < lastSteps[0];
  if (!stillFalling || 1 - nowOdds / peak < SLIDE) return null;
  race.slideAlerted.add(umaban);
  return {
    type: "slide",
    umaban,
    text: `じわじわ下落 ${peak}→${nowOdds}倍 (締切前の約10分で${Math.round((1 - nowOdds / peak) * 100)}%下落・下がり続けている)`,
  };
}

// --- 前回・約10分前のスナップショットと比べて、大口/急落/じわじわ下落を検出 ---
function detect(race, prev, cur) {
  const alerts = [];
  const poolIn = cur.pool - prev.pool;
  const tenMinAgo = race.snaps.filter((s) => parseAt(cur.at) - parseAt(s.at) >= 9 * 60 * 1000).at(-1);
  const phase = parseAt(cur.at) < closeTime(race) ? "pre" : "post";

  for (const [umaban, h] of Object.entries(cur.horses)) {
    const p = prev.horses[umaban];
    if (!p) continue;
    const inflow = h.est - p.est;
    const prevShare = p.est / prev.pool;
    // 大口: 一定額以上が入り、しかもそれまでの人気の割合(=普段入る割合)の2倍以上を1頭が吸った
    if (poolIn > 0 && inflow >= MIN_YEN && inflow / poolIn >= prevShare * 2) {
      alerts.push({
        type: "big",
        umaban,
        text: `大口 +${man(inflow)} (この間の単勝売上の${Math.round((inflow / poolIn) * 100)}%) ${p.odds}→${h.odds}倍`,
      });
    }
    const base = tenMinAgo?.horses[umaban];
    if (base && 1 - h.odds / base.odds >= DROP && !race.dropAlerted.has(umaban)) {
      race.dropAlerted.add(umaban);
      alerts.push({
        type: "drop",
        umaban,
        text: `急落 ${base.odds}→${h.odds}倍 (約10分で${Math.round((1 - h.odds / base.odds) * 100)}%下落)`,
      });
    }
    if (phase === "pre") {
      const slide = detectSlide(race, cur, umaban);
      if (slide) alerts.push(slide);
    }
  }
  return alerts.map((a) => ({ ...a, phase }));
}

function logCsv(race, snap) {
  if (!existsSync("odds-watch-data")) mkdirSync("odds-watch-data");
  if (!existsSync(CSV_FILE)) appendFileSync(CSV_FILE, "race_id,post_time,official_datetime,status,tansho_pool_yen,umaban,odds,ninki\n");
  const post = `${pad(race.post.getHours())}:${pad(race.post.getMinutes())}`;
  const rows = Object.entries(snap.horses).map(
    ([u, h]) => `${race.id},${post},${snap.at},${snap.status},${snap.pool},${u},${h.odds},${h.ninki}`
  );
  appendFileSync(CSV_FILE, rows.join("\n") + "\n");
}

// 起動し直したときに、当日のCSVからスナップショットを復元する(アラートも再計算するが通知は出さない)
function restoreFromCsv(races) {
  if (!existsSync(CSV_FILE)) return;
  const byRace = new Map(races.map((r) => [r.id, r]));
  const snapsByRace = new Map();
  readFileSync(CSV_FILE, "utf8")
    .split("\n")
    .slice(1)
    .forEach((line) => {
      const [raceId, , at, status, pool, umaban, odds, ninki] = line.split(",");
      if (!byRace.has(raceId) || !odds) return;
      if (!snapsByRace.has(raceId)) snapsByRace.set(raceId, new Map());
      const snaps = snapsByRace.get(raceId);
      if (!snaps.has(at)) snaps.set(at, { at, status, pool: Number(pool), horses: {} });
      snaps.get(at).horses[umaban] = { odds: Number(odds), ninki: Number(ninki) };
    });
  for (const [raceId, snaps] of snapsByRace) {
    const race = byRace.get(raceId);
    for (const snap of [...snaps.values()].sort((a, b) => a.at.localeCompare(b.at))) {
      addEstimates(snap.horses, snap.pool);
      const prev = race.snaps.at(-1);
      race.snaps.push(snap);
      if (prev) race.alerts.push(...detect(race, prev, snap).map((a) => ({ ...a, at: snap.at })));
    }
  }
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
  for (const a of detect(race, prev, snap)) {
    race.alerts.push({ ...a, at: snap.at });
    const name = names.get(`${race.id}_${a.umaban}`) ?? "";
    if (a.phase === "pre") {
      console.log(`\x1b[41m\x1b[97m 【${race.label} 締切前】${a.umaban}番${name} ${a.text} \x1b[0m`);
      notify(`${race.label} ${race.name} 締切前`, `${a.umaban}番${name} ${a.text}`);
    } else {
      console.log(`\x1b[90m 【${race.label} 締切後】${a.umaban}番${name} ${a.text} \x1b[0m`);
    }
  }
}

// --- ブラウザ画面向けの状態 ---
function raceState(race, names) {
  const minsLeft = (race.post - now()) / 60000;
  const state = race.done || minsLeft < -3 ? "done" : minsLeft <= WINDOW_MIN ? "watching" : "waiting";
  const horseIds = [...new Set(race.snaps.flatMap((s) => Object.keys(s.horses)))].sort();
  return {
    id: race.id,
    label: race.label,
    name: race.name,
    post: race.post.toISOString(),
    close: closeTime(race).toISOString(),
    state,
    times: race.snaps.map((s) => s.at),
    pools: race.snaps.map((s) => s.pool),
    horses: horseIds.map((u) => ({
      umaban: u,
      name: names.get(`${race.id}_${u}`) ?? "",
      odds: race.snaps.map((s) => s.horses[u]?.odds ?? null),
      est: race.snaps.map((s) => (s.horses[u] ? Math.round(s.horses[u].est) : null)),
      ninki: race.snaps.at(-1)?.horses[u]?.ninki ?? null,
    })),
    alerts: race.alerts,
  };
}

function startServer(races, names) {
  const page = readFileSync(new URL("./odds-watch.html", import.meta.url));
  const server = createServer((req, res) => {
    if (req.url === "/api/state") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(
        JSON.stringify({
          now: now().toISOString(),
          settings: { minYen: MIN_YEN, drop: DROP, slide: SLIDE, windowMin: WINDOW_MIN },
          races: races.map((r) => raceState(r, names)),
        })
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
  });
  server.on("error", (err) => {
    if (err.code !== "EADDRINUSE") throw err;
    console.error(
      `ポート${PORT}が使用中です。別のターミナルでodds-watchが動いていないか確認して、そちらをCtrl+Cで止めてから起動し直してください。`
    );
    process.exit(1);
  });
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`画面: ${url}`);
    if (AUTO_OPEN && process.platform === "darwin") execFile("open", [url]);
  });
}

async function main() {
  let races;
  if (SINGLE_RACE) {
    const post = now();
    post.setMinutes(post.getMinutes() + 10);
    races = [{ id: SINGLE_RACE, label: raceLabel(SINGLE_RACE), name: "(動作確認)", post }];
  } else {
    races = await fetchTodayRaces(todayStr());
  }
  if (races.length === 0) {
    console.log("今日のJRAレースが見つかりませんでした");
    return;
  }
  const names = await fetchHorseNames(races.map((r) => r.id));
  races.forEach((r) => Object.assign(r, { snaps: [], alerts: [], dropAlerted: new Set(), slideAlerted: new Set(), lastPoll: 0, done: false }));
  if (!SINGLE_RACE) restoreFromCsv(races);
  console.log(
    `${races.length}レースを監視します(発走${WINDOW_MIN}分前から / 大口=${man(MIN_YEN)}以上 / 急落=${DROP * 100}%以上 / じわじわ下落=${SLIDE * 100}%以上)。Ctrl+Cで終了`
  );
  startServer(races, names);

  while (races.some((r) => !r.done)) {
    for (const race of races) {
      if (race.done) continue;
      const minsLeft = (race.post - now()) / 60000;
      if (minsLeft > WINDOW_MIN) continue;
      if (minsLeft < -3) {
        // 発走後に確定寸前のオッズをもう1回だけ残して終了(起動前にとっくに終わっていたレースは取りに行かない)
        if (minsLeft > -10) await poll(race, names).catch(() => {});
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
  console.log("今日の監視はすべて終了しました(画面は開いたままにしてあります。Ctrl+Cで終了)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
