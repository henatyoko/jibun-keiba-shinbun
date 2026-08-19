import { supabase } from "./supabaseClient";

// 各馬のAI一言コメント+スコア補正を取得する。過去成績はJV-Data由来のものを渡す
// (jvHorseHistoryRepository.fetchJvPastRacesの戻り値と同じ形)。
// horses: [{ horseId, name }] の配列
// jvPastByHorse: { [horseId]: pastRaces[] }
// 戻り値: { [horseId]: { comment, scoreAdjustment } }
export async function fetchAiNotes(horses, jvPastByHorse) {
  const uniqueById = new Map();
  horses.forEach((h) => {
    if (h.horseId) uniqueById.set(h.horseId, h.name);
  });
  if (uniqueById.size === 0) return {};

  const requestHorses = [...uniqueById.entries()].map(([horseId, name]) => ({
    horseId,
    name,
    pastRaces: jvPastByHorse[horseId] ?? [],
  }));

  const { data, error } = await supabase.functions.invoke("fetch-horse-past", {
    body: { horses: requestHorses },
  });

  if (error || data?.error) return {};
  return data.notes ?? {};
}
