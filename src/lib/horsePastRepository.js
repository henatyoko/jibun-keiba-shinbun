import { supabase } from "./supabaseClient";

// レースに出走する馬たちの過去5走(着順つき)、Claude Haikuによる一言コメント+
// スコア補正、父馬名(血統)、調教師・馬主を取得する。Edge Function側でいずれも
// キャッシュしているので、呼び出し側は毎回このまま呼んでよい。
// horses: [{ horseId, name }] の配列
// 戻り値: { past, notes, sires, profiles: { [horseId]: { trainer, owner } } }
export async function fetchHorsePastRaces(horses) {
  const uniqueById = new Map();
  horses.forEach((h) => {
    if (h.horseId) uniqueById.set(h.horseId, h.name);
  });
  if (uniqueById.size === 0) return { past: {}, notes: {}, sires: {}, profiles: {} };

  const horseIds = [...uniqueById.keys()];
  const horseNames = Object.fromEntries(uniqueById);

  const { data, error } = await supabase.functions.invoke("fetch-horse-past", {
    body: { horseIds, horseNames },
  });

  if (error || data?.error) return { past: {}, notes: {}, sires: {}, profiles: {} };
  return {
    past: data.past ?? {},
    notes: data.notes ?? {},
    sires: data.sires ?? {},
    profiles: data.profiles ?? {},
  };
}
