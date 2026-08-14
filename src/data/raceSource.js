import { MOCK_RACES } from "./mockRaces";

// レース・出走馬データの取得口。
//
// 現状はモックデータを返すだけだが、将来的にはここを
// JRA-VAN Data Lab 経由のAPI呼び出し(補完情報としてnetkeibaも低頻度で併用予定)
// に差し替える想定。呼び出し側(コンポーネント)はこの関数のシグネチャにだけ依存する。
export async function fetchRaces() {
  return MOCK_RACES;
}
