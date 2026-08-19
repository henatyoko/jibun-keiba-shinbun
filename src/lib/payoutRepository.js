import { supabase } from "./supabaseClient";

// 終了済みレースの実際の単勝払戻を取得する。
// JV-Dataのharaimodoshi(払戻情報)テーブルより。データが無ければnullを返す。
export async function fetchRacePayouts(raceCode) {
  const { data, error } = await supabase
    .from("haraimodoshi")
    .select("tansho1_umaban, tansho1_haraimodoshikin")
    .eq("race_code", raceCode)
    .maybeSingle();

  if (error || !data || !data.tansho1_umaban) return { win: null };

  return {
    win: {
      num: Number(data.tansho1_umaban),
      payout: Number(data.tansho1_haraimodoshikin),
    },
  };
}
