import { supabase } from "./supabaseClient";

// レースに出走する馬たちの過去5走(着順つき)を取得する。
// Edge Function側でキャッシュ(3日以内なら再取得しない)しているので、
// 呼び出し側は毎回このまま呼んでよい。
export async function fetchHorsePastRaces(horseIds) {
  const ids = [...new Set(horseIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase.functions.invoke("fetch-horse-past", {
    body: { horseIds: ids },
  });

  if (error || data?.error) return {};
  return data;
}
