import { supabase } from "./supabaseClient";

// ログイン中ユーザーが付けた「このレースの予想は自信あり」フラグを扱う窓口。
export async function fetchRaceConfidence(userId, raceId) {
  const { data, error } = await supabase
    .from("race_confidence")
    .select("confident")
    .eq("user_id", userId)
    .eq("race_id", raceId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.confident);
}

export async function setRaceConfidence(userId, raceId, confident) {
  if (!confident) {
    const { error } = await supabase
      .from("race_confidence")
      .delete()
      .eq("user_id", userId)
      .eq("race_id", raceId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("race_confidence")
    .upsert(
      { user_id: userId, race_id: raceId, confident: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id,race_id" }
    );
  if (error) throw error;
}
