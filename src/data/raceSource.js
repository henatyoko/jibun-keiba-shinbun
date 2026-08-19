import { MOCK_RACES } from "./mockRaces";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
import { PLACE_NAMES, gradeBadge, raceTitle, distanceLabel } from "./jvCodeTables";

// レース・出走馬データの取得口。
//
// JvLink To ImporterがSupabase(Postgres)に直接取り込んだJV-Data公式テーブル
// (race_shosai=RA レース詳細, umagoto_race_joho=SE 馬ごとレース情報,
//  kyosoba_master2=競走馬マスタ)を読む。データが無い場合はモックにフォールバックする。
export async function fetchRaces() {
  if (!isSupabaseConfigured) return MOCK_RACES;

  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const { data: raceRows, error: raceError } = await supabase
    .from("race_shosai")
    .select(
      "race_code, kaisai_nen, kaisai_gappi, keibajo_code, race_bango, kyosomei_hondai, grade_code, kyoso_shubetsu_code, kyoso_joken_code_2sai, kyoso_joken_code_3sai, kyoso_joken_code_4sai, kyoso_joken_code_5sai_ijo, kyoso_joken_code_saijakunen, kyori, track_code, hasso_jikoku"
    )
    .gte("race_code", `${todayStr}0000000000`)
    .order("race_code", { ascending: true });

  if (raceError || !raceRows || raceRows.length === 0) return MOCK_RACES;

  const raceCodes = raceRows.map((r) => r.race_code);
  const { data: entryRows, error: entryError } = await supabase
    .from("umagoto_race_joho")
    .select("race_code, umaban, wakuban, ketto_toroku_bango, bamei, kishumei_ryakusho, barei")
    .in("race_code", raceCodes);

  if (entryError) return MOCK_RACES;

  const horseIds = [...new Set((entryRows || []).map((e) => e.ketto_toroku_bango))];
  const { data: sireRows } = await supabase
    .from("kyosoba_master2")
    .select("ketto_toroku_bango, ketto1_bamei")
    .in("ketto_toroku_bango", horseIds);
  const sireByHorseId = Object.fromEntries((sireRows || []).map((s) => [s.ketto_toroku_bango, s.ketto1_bamei]));

  const entriesByRaceCode = {};
  (entryRows || []).forEach((e) => {
    (entriesByRaceCode[e.race_code] ||= []).push(e);
  });

  return raceRows.map((race) => {
    const rawDate = `${race.kaisai_nen}-${race.kaisai_gappi.slice(0, 2)}-${race.kaisai_gappi.slice(2, 4)}`;
    const horses = (entriesByRaceCode[race.race_code] || [])
      .slice()
      .sort((a, b) => Number(a.umaban) - Number(b.umaban))
      .map((h) => ({
        num: Number(h.umaban),
        waku: Number(h.wakuban),
        name: h.bamei,
        horseId: h.ketto_toroku_bango,
        sire: sireByHorseId[h.ketto_toroku_bango] || null,
        jockey: h.kishumei_ryakusho,
        age: Number(h.barei),
        base: 70,
      }));

    return {
      id: race.race_code,
      grade: gradeBadge(race),
      name: raceTitle(race),
      place: PLACE_NAMES[race.keibajo_code] || race.keibajo_code,
      raceNumber: Number(race.race_bango),
      distance: distanceLabel(race.track_code, race.kyori),
      rawDate,
      date: formatRaceDate(rawDate, race.hasso_jikoku),
      horses,
    };
  });
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatRaceDate(raceDate, hassoJikoku) {
  const d = new Date(`${raceDate}T00:00:00+09:00`);
  const md = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  if (!hassoJikoku || hassoJikoku.length < 4) return md;
  const postTime = `${hassoJikoku.slice(0, 2)}:${hassoJikoku.slice(2, 4)}`;
  return `${md} ${postTime}`;
}
