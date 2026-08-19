import { supabase } from "./supabaseClient";

// 終了済みレースの実際の馬単(1着-2着)払戻を取得する。
// JV-Dataのharaimodoshi(払戻情報)テーブルより。データが無ければnullを返す。
export async function fetchExactaPayout(raceCode) {
  const { data, error } = await supabase
    .from("haraimodoshi")
    .select("umatan1_kumiban1, umatan1_kumiban2, umatan1_haraimodoshikin, umatan1_ninkijun")
    .eq("race_code", raceCode)
    .maybeSingle();

  if (error || !data || !data.umatan1_kumiban1) return null;

  return {
    first: Number(data.umatan1_kumiban1),
    second: Number(data.umatan1_kumiban2),
    payout: Number(data.umatan1_haraimodoshikin),
    ninki: data.umatan1_ninkijun ? Number(data.umatan1_ninkijun) : null,
  };
}
