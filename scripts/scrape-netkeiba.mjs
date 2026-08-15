// netkeibaから近日中(当日+2日先まで)のレース・出馬表を低頻度で取得し、Supabaseへ保存するスクリプト。
// 1日1回、GitHub Actionsのスケジュール実行から呼び出す想定。
//
// 注意: netkeiba.comの利用規約上、私的利用の範囲を超える利用は禁止されている。
// このスクリプトはユーザー本人の非公開アプリのためだけに、低頻度・最小限の情報のみを取得する。

import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const HEADERS = {
  "User-Agent": "jibun-keiba-shinbun-scraper/1.0 (personal, low-frequency, private use)",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function fetchRaceIdsForDate(kaisaiDate) {
  const url = `https://race.netkeiba.com/top/race_list.html?kaisai_date=${kaisaiDate}`;
  const res = await fetch(url, { headers: HEADERS });
  console.log(`GET ${url} -> ${res.status}`);
  if (!res.ok) return [];
  const html = await res.text();
  console.log(`  html length: ${html.length}`);
  console.log(`  title: ${(html.match(/<title>([^<]*)<\/title>/) || [])[1]}`);
  console.log(`  snippet: ${html.replace(/\s+/g, " ").slice(0, 300)}`);
  const $ = cheerio.load(html);
  const ids = new Set();
  $('a[href*="shutuba.html?race_id"]').each((_, el) => {
    const href = $(el).attr("href");
    const match = href.match(/race_id=(\d+)/);
    if (match) ids.add(match[1]);
  });
  return [...ids];
}

function parseAge(sexAge) {
  const match = sexAge?.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

async function fetchRace(raceId) {
  const url = `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text();
  const name = $('[class*="RaceName"]').first().text().trim() || title.split("|")[0].replace(/\([^)]*\)/, "").trim();
  const gradeMatch = title.match(/\(([^)]+)\)/);
  const grade = gradeMatch ? gradeMatch[1] : null;
  const placeMatch = title.match(/\d{4}年\d{1,2}月\d{1,2}日\s+(\S+?)\d+R/);
  const place = placeMatch ? placeMatch[1] : null;
  const dateMatch = title.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const raceDate = dateMatch ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}` : null;

  const data1 = $('[class*="RaceData01"]').first().text().replace(/\s+/g, " ").trim();
  const postTimeMatch = data1.match(/(\d{1,2}:\d{2})発走/);
  const postTime = postTimeMatch ? postTimeMatch[1] : null;
  const distanceMatch = data1.match(/([芝ダ障][0-9]+m)/);
  const distance = distanceMatch ? distanceMatch[1] : data1;

  if (!name || !place || !raceDate) return null;

  const entries = [];
  $("table tr").each((_, row) => {
    const cells = $(row)
      .children()
      .map((_, c) => $(c).text().replace(/\s+/g, " ").trim())
      .get();
    // 期待する列: 枠, 馬番, 印, 馬名, 性齢, 斤量, 騎手, 厩舎, ...
    const waku = Number(cells[0]);
    const num = Number(cells[1]);
    const horseName = cells[3];
    const sexAge = cells[4];
    const jockey = cells[6];
    if (Number.isInteger(waku) && Number.isInteger(num) && horseName && jockey) {
      entries.push({ waku, num, horse_name: horseName, jockey, age: parseAge(sexAge) });
    }
  });

  return {
    id: raceId,
    name,
    grade,
    place,
    distance,
    race_date: raceDate,
    post_time: postTime,
    entries,
  };
}

async function main() {
  const today = new Date();
  const dates = [0, 1, 2].map((offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return formatDate(d);
  });

  const raceIds = new Set();
  for (const kaisaiDate of dates) {
    const ids = await fetchRaceIdsForDate(kaisaiDate);
    ids.forEach((id) => raceIds.add(id));
    await sleep(1000);
  }

  console.log(`対象レース数: ${raceIds.size}`);

  for (const raceId of raceIds) {
    const race = await fetchRace(raceId);
    await sleep(1500);
    if (!race || race.entries.length === 0) continue;

    const { entries, ...raceRow } = race;
    const { error: raceError } = await supabase.from("races").upsert(raceRow);
    if (raceError) {
      console.error(`レース保存失敗 (${raceId}):`, raceError.message);
      continue;
    }

    const entryRows = entries.map((e) => ({ ...e, race_id: raceId }));
    const { error: entryError } = await supabase
      .from("race_entries")
      .upsert(entryRows, { onConflict: "race_id,num" });
    if (entryError) {
      console.error(`出馬表保存失敗 (${raceId}):`, entryError.message);
      continue;
    }

    console.log(`保存完了: ${race.name} (${raceId}) 出走${entries.length}頭`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
