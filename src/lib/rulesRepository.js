import { supabase } from "./supabaseClient";

// ログイン中ユーザーの知見ルールをSupabaseから取得・保存する窓口。
export async function fetchRules(userId) {
  const [{ data: attrRules, error: attrError }, { data: trendRules, error: trendError }] = await Promise.all([
    supabase.from("attr_rules").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("trend_rules").select("*").eq("user_id", userId).order("created_at"),
  ]);
  if (attrError) throw attrError;
  if (trendError) throw trendError;
  return { attrRules, trendRules };
}

export async function insertAttrRule(userId, rule) {
  const { data, error } = await supabase
    .from("attr_rules")
    .insert({ user_id: userId, type: rule.type, value: rule.value, score: rule.score })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAttrRule(id) {
  const { error } = await supabase.from("attr_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function insertTrendRule(userId, rule) {
  const { data, error } = await supabase
    .from("trend_rules")
    .insert({
      user_id: userId,
      race: rule.race,
      type: rule.type,
      value: rule.value,
      score: rule.score,
      label: rule.label,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTrendRule(id) {
  const { error } = await supabase.from("trend_rules").delete().eq("id", id);
  if (error) throw error;
}
