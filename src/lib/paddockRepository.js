import { supabase } from "./supabaseClient";

// ログイン中ユーザーが入力した、そのレースの出走馬ごとのパドック評価(A/B/無印)を扱う窓口。
export async function fetchPaddockGrades(userId, raceId) {
  const { data, error } = await supabase
    .from("paddock_grades")
    .select("horse_num, grade")
    .eq("user_id", userId)
    .eq("race_id", raceId);
  if (error) throw error;
  const byHorseNum = {};
  data.forEach((row) => {
    byHorseNum[row.horse_num] = row.grade;
  });
  return byHorseNum;
}

// grade が null の場合は評価を削除する(未選択に戻す)。
export async function setPaddockGrade(userId, raceId, horseNum, grade) {
  if (!grade) {
    const { error } = await supabase
      .from("paddock_grades")
      .delete()
      .eq("user_id", userId)
      .eq("race_id", raceId)
      .eq("horse_num", horseNum);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("paddock_grades")
    .upsert(
      { user_id: userId, race_id: raceId, horse_num: horseNum, grade, updated_at: new Date().toISOString() },
      { onConflict: "user_id,race_id,horse_num" }
    );
  if (error) throw error;
}
