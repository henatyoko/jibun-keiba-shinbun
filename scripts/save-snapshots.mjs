// 結果確定済み(払戻データあり)で、まだ予想スナップショット(race_snapshots)が無いレースについて、
// 本番サイトのレース詳細画面をヘッドレスブラウザで開き、画面側の計算ロジックにスナップショットを
// 保存させるスクリプト。レース後に初めて開いた人が15〜20秒待たされないようにするのが目的。
//
// 計算ロジックは画面(RaceDetail)に一本化したまま、同じ結果をそのまま使うためにブラウザ経由にしている。
// GitHub Actionsのスケジュール実行(月曜以降)から呼び出す想定。
//
// 環境変数: SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL(省略時 https://keiba.henatyoko.com)
// 任意: LOOKBACK_DAYS(既定10), CONCURRENCY(既定3), PER_RACE_TIMEOUT_SEC(既定120)

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL = (process.env.SITE_URL || "https://keiba.henatyoko.com").replace(/\/$/, "");
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 10);
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const PER_RACE_TIMEOUT_MS = Number(process.env.PER_RACE_TIMEOUT_SEC || 120) * 1000;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("SUPABASE_URL / SUPABASE_ANON_KEY が設定されていません");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// JSTの日付をYYYYMMDDで返す(Actionsのサーバー時刻はUTCなので明示的にずらす)
function jstDayString(offsetDays) {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}${String(jst.getUTCMonth() + 1).padStart(2, "0")}${String(jst.getUTCDate()).padStart(2, "0")}`;
}

// PostgRESTの1回あたり上限(1000件)を超えないようページングして全件取得する
async function fetchAllCodes(table, fromPrefix, toPrefix) {
  const PAGE_SIZE = 1000;
  const codes = new Set();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("race_code")
      .gte("race_code", `${fromPrefix}0000000000`)
      .lt("race_code", `${toPrefix}0000000000`)
      .order("race_code", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    data.forEach((r) => codes.add(r.race_code));
    if (data.length < PAGE_SIZE) break;
  }
  return codes;
}

async function hasSnapshot(raceCode) {
  const { count, error } = await supabase
    .from("race_snapshots")
    .select("race_code", { count: "exact", head: true })
    .eq("race_code", raceCode);
  return !error && (count ?? 0) > 0;
}

async function main() {
  // 今日の開催分はまだ結果確定前(画面側も「終了済み」扱いにならない)ので、昨日までを対象にする
  const fromPrefix = jstDayString(-LOOKBACK_DAYS);
  const toPrefix = jstDayString(0);

  const [paid, snapped] = await Promise.all([
    fetchAllCodes("haraimodoshi", fromPrefix, toPrefix),
    fetchAllCodes("race_snapshots", fromPrefix, toPrefix),
  ]);
  const targets = [...paid].filter((c) => !snapped.has(c)).sort();
  console.log(`対象期間 ${fromPrefix}〜${toPrefix}: 払戻あり ${paid.size}R / スナップショット済み ${snapped.size}R / 保存対象 ${targets.length}R`);
  if (targets.length === 0) return;

  const browser = await chromium.launch();
  const queue = [...targets];
  let saved = 0;
  const failed = [];

  async function worker() {
    const context = await browser.newContext();
    while (queue.length > 0) {
      const code = queue.shift();
      const page = await context.newPage();
      try {
        await page.goto(`${SITE_URL}/races/${code}`, { waitUntil: "domcontentloaded" });
        const deadline = Date.now() + PER_RACE_TIMEOUT_MS;
        let ok = false;
        while (Date.now() < deadline) {
          await sleep(3000);
          if (await hasSnapshot(code)) {
            ok = true;
            break;
          }
        }
        if (ok) {
          saved += 1;
          console.log(`保存OK ${code}`);
        } else {
          failed.push(code);
          console.log(`保存されず(時間切れ/印が計算できないレース) ${code}`);
        }
      } catch (e) {
        failed.push(code);
        console.log(`エラー ${code}: ${e.message}`);
      } finally {
        await page.close();
      }
    }
    await context.close();
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();

  console.log(`完了: 保存 ${saved}R / 未保存 ${failed.length}R${failed.length ? ` (${failed.join(", ")})` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
