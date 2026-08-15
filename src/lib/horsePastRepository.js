import { supabase } from "./supabaseClient";

// レースに出走する馬たちの過去5走(着順つき)、Claude Haikuによる一言コメント+
// スコア補正、父馬名(血統)を取得する。Edge Function側でいずれもキャッシュしているので、
// 呼び出し側は毎回このまま呼んでよい。
// horses: [{ horseId, name }] の配列
// 戻り値: { past: { [horseId]: race[] }, notes: { [horseId]: { comment, scoreAdjustment } }, sires: { [horseId]: string } }
export async function fetchHorsePastRaces(horses) {
  const uniqueById = new Map();
  horses.forEach((h) => {
    if (h.horseId) uniqueById.set(h.horseId, h.name);
  });
  if (uniqueById.size === 0) return { past: {}, notes: {}, sires: {} };

  const horseIds = [...uniqueById.keys()];
  const horseNames = Object.fromEntries(uniqueById);

  const { data, error } = await supabase.functions.invoke("fetch-horse-past", {
    body: { horseIds, horseNames },
  });

  if (error || data?.error) return { past: {}, notes: {}, sires: {} };
  return { past: data.past ?? {}, notes: data.notes ?? {}, sires: data.sires ?? {} };
}
