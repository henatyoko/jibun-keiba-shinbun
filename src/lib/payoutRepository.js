import { supabase } from "./supabaseClient";

// 終了済みレースの実際の払戻(単勝・複勝・馬連・馬単・3連複・3連単)を取得する。
// JV-Dataのharaimodoshi(払戻情報)テーブルより。データが無ければ空配列を返す。
export async function fetchRacePayouts(raceCode) {
  const { data, error } = await supabase
    .from("haraimodoshi")
    .select(
      "tansho1_umaban, tansho1_haraimodoshikin, " +
        "fukusho1_umaban, fukusho1_haraimodoshikin, fukusho2_umaban, fukusho2_haraimodoshikin, fukusho3_umaban, fukusho3_haraimodoshikin, " +
        "umaren1_kumiban1, umaren1_kumiban2, umaren1_haraimodoshikin, " +
        "umatan1_kumiban1, umatan1_kumiban2, umatan1_haraimodoshikin, " +
        "sanrenpuku1_kumiban1, sanrenpuku1_kumiban2, sanrenpuku1_kumiban3, sanrenpuku1_haraimodoshikin, " +
        "sanrentan1_kumiban1, sanrentan1_kumiban2, sanrentan1_kumiban3, sanrentan1_haraimodoshikin"
    )
    .eq("race_code", raceCode)
    .maybeSingle();

  if (error || !data || !data.tansho1_umaban) return { win: null, payouts: [] };

  const num = (v) => Number(v);
  const yen = (v) => Number(v);
  const payouts = [];

  if (data.tansho1_umaban) {
    payouts.push({ label: "単勝", combo: `${num(data.tansho1_umaban)}`, amount: yen(data.tansho1_haraimodoshikin) });
  }
  [1, 2, 3].forEach((i) => {
    const u = data[`fukusho${i}_umaban`];
    if (u && u !== "00") {
      payouts.push({ label: "複勝", combo: `${num(u)}`, amount: yen(data[`fukusho${i}_haraimodoshikin`]) });
    }
  });
  if (data.umaren1_kumiban1) {
    payouts.push({
      label: "馬連",
      combo: `${num(data.umaren1_kumiban1)}-${num(data.umaren1_kumiban2)}`,
      amount: yen(data.umaren1_haraimodoshikin),
    });
  }
  if (data.umatan1_kumiban1) {
    payouts.push({
      label: "馬単",
      combo: `${num(data.umatan1_kumiban1)}→${num(data.umatan1_kumiban2)}`,
      amount: yen(data.umatan1_haraimodoshikin),
    });
  }
  if (data.sanrenpuku1_kumiban1) {
    payouts.push({
      label: "3連複",
      combo: `${num(data.sanrenpuku1_kumiban1)}-${num(data.sanrenpuku1_kumiban2)}-${num(data.sanrenpuku1_kumiban3)}`,
      amount: yen(data.sanrenpuku1_haraimodoshikin),
    });
  }
  if (data.sanrentan1_kumiban1) {
    payouts.push({
      label: "3連単",
      combo: `${num(data.sanrentan1_kumiban1)}→${num(data.sanrentan1_kumiban2)}→${num(data.sanrentan1_kumiban3)}`,
      amount: yen(data.sanrentan1_haraimodoshikin),
    });
  }

  return {
    win: { num: num(data.tansho1_umaban), payout: yen(data.tansho1_haraimodoshikin) },
    payouts,
  };
}
