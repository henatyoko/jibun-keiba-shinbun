// 知見ルールの永続化窓口。
//
// 現状はブラウザのlocalStorageに保存する。将来Supabase連携を追加する際は
// この2関数(get/set)の中身をSupabaseクライアント呼び出しに差し替えるだけでよいよう、
// 呼び出し側はキーと値の非同期get/setという形にだけ依存させている。
export async function getItem(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function setItem(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}
