import { MOCK_RACES } from "./mockRaces";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";

// レース・出走馬データの取得口。
//
// Supabaseにnetkeibaスクレイパー(scripts/scrape-netkeiba.mjs)が保存した
// races/race_entriesテーブルを読む。データが無い場合はモックにフォールバックする。
// 将来JRA-VAN Data Lab連携に切り替える際も、この関数の中身だけを差し替えればよい。
export async function fetchRaces() {
  if (!isSupabaseConfigured) return MOCK_RACES;

  const { data: races, error } = await supabase
    .from("races")
    .select("id, name, grade, place, distance, race_date, post_time, race_entries(num, waku, horse_name, sire, jockey, age)")
    .order("race_date", { ascending: true })
    .order("post_time", { ascending: true });

  if (error || !races || races.length === 0) return MOCK_RACES;

  return races.map((race) => ({
    id: race.id,
    grade: race.grade || "一般",
    name: race.name,
    place: race.place,
    distance: race.distance,
    date: formatRaceDate(race.race_date, race.post_time),
    horses: race.race_entries.map((h) => ({
      num: h.num,
      waku: h.waku,
      name: h.horse_name,
      sire: h.sire,
      jockey: h.jockey,
      age: h.age,
      base: 70,
    })),
  }));
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatRaceDate(raceDate, postTime) {
  const d = new Date(`${raceDate}T00:00:00+09:00`);
  const md = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  return postTime ? `${md} ${postTime}` : md;
}
