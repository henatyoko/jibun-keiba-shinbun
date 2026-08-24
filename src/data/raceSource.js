import { MOCK_RACES } from "./mockRaces";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { PLACE_NAMES, gradeBadge, raceTitle, distanceLabel } from "./jvCodeTables";

// レース・出走馬データの取得口。
//
// JvLink To ImporterがSupabase(Postgres)に直接取り込んだJV-Data公式テーブル
// (race_shosai=RA レース詳細, umagoto_race_joho=SE 馬ごとレース情報,
//  kyosoba_master2=競走馬マスタ)を読む。データが無い場合はモックにフォールバックする。
const RACE_SHOSAI_COLUMNS =
  "race_code, kaisai_nen, kaisai_gappi, keibajo_code, race_bango, kyosomei_hondai, grade_code, kyoso_shubetsu_code, kyoso_joken_code_2sai, kyoso_joken_code_3sai, kyoso_joken_code_4sai, kyoso_joken_code_5sai_ijo, kyoso_joken_code_saijakunen, kyori, track_code, hasso_jikoku, juryo_shubetsu_code";

export async function fetchRaces() {
  if (!isSupabaseConfigured) return MOCK_RACES;

  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const { data: upcoming, error: upcomingError } = await supabase
    .from("race_shosai")
    .select(RACE_SHOSAI_COLUMNS)
    .gte("race_code", `${todayStr}0000000000`)
    .order("race_code", { ascending: true });

  if (upcomingError) return MOCK_RACES;
  if (upcoming && upcoming.length > 0) return assembleRaces(upcoming, false);

  // 今後の開催データがまだ無い時は、代わりに直近で終わった開催の結果を振り返り表示する
  const { data: latest } = await supabase
    .from("race_shosai")
    .select("kaisai_nen, kaisai_gappi")
    .lt("race_code", `${todayStr}0000000000`)
    .order("race_code", { ascending: false })
    .limit(1);

  if (!latest || latest.length === 0) return MOCK_RACES;

  const { kaisai_nen, kaisai_gappi } = latest[0];
  const latestDayPrefix = `${kaisai_nen}${kaisai_gappi}`;

  // 直近の開催日の前日にも開催があれば(土日開催のパターン)、両日まとめて振り返り対象にする
  const latestDate = new Date(
    `${kaisai_nen}-${kaisai_gappi.slice(0, 2)}-${kaisai_gappi.slice(2, 4)}T00:00:00+09:00`
  );
  const prevDate = new Date(latestDate.getTime() - 24 * 60 * 60 * 1000);
  const prevDayPrefix = `${prevDate.getFullYear()}${String(prevDate.getMonth() + 1).padStart(2, "0")}${String(prevDate.getDate()).padStart(2, "0")}`;

  const { data: prevDayCheck } = await supabase
    .from("race_shosai")
    .select("race_code")
    .gte("race_code", `${prevDayPrefix}0000000000`)
    .lt("race_code", `${prevDayPrefix}9999999999`)
    .limit(1);
  const rangeStartPrefix = prevDayCheck && prevDayCheck.length > 0 ? prevDayPrefix : latestDayPrefix;

  const { data: pastRows, error: pastError } = await supabase
    .from("race_shosai")
    .select(RACE_SHOSAI_COLUMNS)
    .gte("race_code", `${rangeStartPrefix}0000000000`)
    .lt("race_code", `${latestDayPrefix}9999999999`)
    .order("race_code", { ascending: true });

  if (pastError || !pastRows || pastRows.length === 0) return MOCK_RACES;
  return assembleRaces(pastRows, true);
}

// 対象レースが多い(複数場・複数日開催)とSupabase/PostgRESTの1回あたりの上限(既定1000件)を
// 超えることがあるため、.range()でページングして全件取得する。
async function fetchAllRows(table, columns, filterFn) {
  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await filterFn(supabase.from(table).select(columns)).range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

async function assembleRaces(raceRows, isPastReview) {
  const raceCodes = raceRows.map((r) => r.race_code);
  const { rows: entryRows, error: entryError } = await fetchAllRows(
    "umagoto_race_joho",
    "race_code, umaban, wakuban, ketto_toroku_bango, bamei, kishumei_ryakusho, chokyoshimei_ryakusho, banushimei_hojinkaku_nashi, barei, kakutei_chakujun, tansho_odds, tansho_ninkijun, futan_juryo",
    (q) => q.in("race_code", raceCodes)
  );

  if (entryError) return MOCK_RACES;

  // umagoto_race_joho(SE)のtansho_odds/tansho_ninkijunはレース確定後に埋まる確定オッズのため、
  // レース前は仕様上ずっと未確定("0000")のまま。レース前のオッズはodds1_tansho(時系列オッズ)側にしか
  // 無いので、そちらの最新スナップショットを優先して使う。
  const { rows: oddsRows } = await fetchAllRows("odds1_tansho", "race_code, umaban, odds, ninki, insert_timestamp", (q) =>
    q.in("race_code", raceCodes).order("insert_timestamp", { ascending: false })
  );
  const latestOddsByKey = {};
  (oddsRows || []).forEach((o) => {
    const key = `${o.race_code}_${o.umaban}`;
    if (!(key in latestOddsByKey)) latestOddsByKey[key] = o;
  });

  const horseIds = [...new Set((entryRows || []).map((e) => e.ketto_toroku_bango))];
  const { data: sireRows } = await supabase
    .from("kyosoba_master2")
    .select(`ketto_toroku_bango, ketto1_bamei, ketto1_hanshoku_toroku_bango, ketto5_hanshoku_toroku_bango, ${DISTANCE_BUCKET_COLUMNS}`)
    .in("ketto_toroku_bango", horseIds);
  const sireByHorseId = Object.fromEntries((sireRows || []).map((s) => [s.ketto_toroku_bango, s.ketto1_bamei]));
  const distanceStatsByHorseId = Object.fromEntries((sireRows || []).map((s) => [s.ketto_toroku_bango, extractDistanceStats(s)]));
  const pedigreeIdsByHorseId = Object.fromEntries(
    (sireRows || []).map((s) => [s.ketto_toroku_bango, { sireId: s.ketto1_hanshoku_toroku_bango, damsireId: s.ketto5_hanshoku_toroku_bango }])
  );

  const entriesByRaceCode = {};
  (entryRows || []).forEach((e) => {
    (entriesByRaceCode[e.race_code] ||= []).push(e);
  });

  return raceRows.map((race) => {
    const rawDate = `${race.kaisai_nen}-${race.kaisai_gappi.slice(0, 2)}-${race.kaisai_gappi.slice(2, 4)}`;
    const horses = (entriesByRaceCode[race.race_code] || [])
      .slice()
      .sort((a, b) => Number(a.umaban) - Number(b.umaban))
      .map((h) => {
        const liveOdds = latestOddsByKey[`${h.race_code}_${h.umaban}`];
        return {
          num: Number(h.umaban),
          waku: Number(h.wakuban),
          name: h.bamei,
          horseId: h.ketto_toroku_bango,
          sire: sireByHorseId[h.ketto_toroku_bango] || null,
          distanceStats: distanceStatsByHorseId[h.ketto_toroku_bango] || null,
          sireId: pedigreeIdsByHorseId[h.ketto_toroku_bango]?.sireId || null,
          damsireId: pedigreeIdsByHorseId[h.ketto_toroku_bango]?.damsireId || null,
          jockey: h.kishumei_ryakusho,
          trainer: h.chokyoshimei_ryakusho || null,
          owner: h.banushimei_hojinkaku_nashi || null,
          age: Number(h.barei),
          base: 70,
          result: positiveOrNull(h.kakutei_chakujun),
          odds: positiveOrNull(liveOdds?.odds, 10) ?? positiveOrNull(h.tansho_odds, 10),
          ninki: positiveOrNull(liveOdds?.ninki) ?? positiveOrNull(h.tansho_ninkijun),
          futanJuryo: positiveOrNull(h.futan_juryo, 10),
        };
      });

    return {
      id: race.race_code,
      grade: gradeBadge(race),
      name: raceTitle(race),
      place: PLACE_NAMES[race.keibajo_code] || race.keibajo_code,
      raceNumber: Number(race.race_bango),
      distance: distanceLabel(race.track_code, race.kyori),
      rawDate,
      date: formatRaceDate(rawDate, race.hasso_jikoku),
      isPastReview,
      isHandicap: race.juryo_shubetsu_code === "1",
      horses,
    };
  });
}

// JV-Dataは未確定の値を"00"/"0000"のような0埋め文字列で表す(結果・オッズ・人気など)。
// 素直に文字列の真偽値で判定すると"00"がtruthyになり0が紛れ込むため、必ず正の数かで判定する。
function positiveOrNull(value, divisor = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n / divisor : null;
}

// 競走馬マスタの距離別着回数(芝/ダート × 短距離[〜1600m]/中距離[1601〜2200m]/長距離[2201m〜])。
// 距離適性の判定に使う。
const DISTANCE_BUCKETS = ["shiba_short", "shiba_middle", "shiba_long", "dirt_short", "dirt_middle", "dirt_long"];
const DISTANCE_BUCKET_COLUMNS = DISTANCE_BUCKETS.map(
  (b) => `${b}_1chaku, ${b}_2chaku, ${b}_3chaku, ${b}_4chaku, ${b}_5chaku, ${b}_chakugai`
).join(", ");

function extractDistanceStats(row) {
  const stats = {};
  DISTANCE_BUCKETS.forEach((b) => {
    stats[b] = {
      chaku1: Number(row[`${b}_1chaku`]) || 0,
      chaku2: Number(row[`${b}_2chaku`]) || 0,
      chaku3: Number(row[`${b}_3chaku`]) || 0,
      chaku4: Number(row[`${b}_4chaku`]) || 0,
      chaku5: Number(row[`${b}_5chaku`]) || 0,
      chakugai: Number(row[`${b}_chakugai`]) || 0,
    };
  });
  return stats;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatRaceDate(raceDate, hassoJikoku) {
  const d = new Date(`${raceDate}T00:00:00+09:00`);
  const md = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  if (!hassoJikoku || hassoJikoku.length < 4) return md;
  const postTime = `${hassoJikoku.slice(0, 2)}:${hassoJikoku.slice(2, 4)}`;
  return `${md} ${postTime}`;
}
