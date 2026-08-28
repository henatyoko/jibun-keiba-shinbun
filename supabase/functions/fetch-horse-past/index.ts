// レース詳細を開いた時に、その場で対象馬のAI一言コメント+スコア補正を生成してキャッシュするEdge Function。
// 過去成績はクライアント側でJV-Data(umagoto_race_joho)から直接取得済みのものを受け取り、
// それを元にClaude Haikuでコメントを書かせる(netkeibaスクレイピングは行わない)。
// 3日以内にキャッシュ済みの馬は再生成しない(低頻度アクセス・低コストを保つため)。

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const CACHE_HOURS = 72;

const NOTE_SYSTEM_PROMPT = `あなたは競馬新聞のベテラン記者です。1頭の馬の直近成績データ(着順・人気・上がり3F)を見て、
競馬新聞の「短評」欄のような一言コメント(20〜40字程度、体言止めや新聞調でよい)と、
その馬の今の調子を反映したスコア補正(-5〜+5の整数、絶好調なら+、不振なら-、
互角なら0に近い値)をJSONで返してください。
人気より着順が良い(人気を上回る好走)ほど高評価、上がり3Fが直近で速くなっているほど高評価にしてください。

出力は次のJSON形式のみとし、説明文やコードブロックは付けないでください。
{"comment":"短評文","scoreAdjustment":整数}

データが乏しく判断できない場合は {"comment":"データ不足のため判断できず","scoreAdjustment":0} を返してください。`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PastRace = {
  race_code?: string;
  kakutei_chakujun?: string | number | null;
  tansho_ninkijun?: string | number | null;
  kohan_3f?: string | number | null;
};

type HorseInput = { horseId: string; name?: string; pastRaces?: PastRace[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "リクエストの形式が不正です" }, 400);
  }

  const horses: HorseInput[] = Array.isArray(body?.horses)
    ? body.horses.filter((h: unknown): h is HorseInput => !!h && typeof (h as HorseInput).horseId === "string")
    : [];
  if (horses.length === 0) {
    return json({ error: "horsesが必要です" }, 400);
  }

  try {
    const notes = await getOrGenerateHorseNotes(horses);
    return json({ notes }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "取得に失敗しました" }, 500);
  }
});

// 各馬のAI一言コメント+スコア補正を取得。3日以内のキャッシュがあれば再生成しない。
async function getOrGenerateHorseNotes(
  horses: HorseInput[]
): Promise<Record<string, { comment: string; scoreAdjustment: number }>> {
  const horseIds = horses.map((h) => h.horseId);
  const staleBefore = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: cachedNotes } = await supabase
    .from("horse_ai_notes")
    .select("horse_id, comment, score_adjustment, fetched_at")
    .in("horse_id", horseIds);

  const notes: Record<string, { comment: string; scoreAdjustment: number }> = {};
  const stale: HorseInput[] = [];

  for (const h of horses) {
    const row = cachedNotes?.find((n) => n.horse_id === h.horseId);
    if (row && row.fetched_at > staleBefore) {
      notes[h.horseId] = { comment: row.comment, scoreAdjustment: row.score_adjustment };
    } else if ((h.pastRaces?.length ?? 0) > 0) {
      stale.push(h);
    }
  }

  if (stale.length === 0 || !ANTHROPIC_API_KEY) return notes;

  const generated = await Promise.all(
    stale.map(async (h) => {
      const note = await generateHorseNote(h.name ?? h.horseId, h.pastRaces ?? []);
      return { id: h.horseId, note };
    })
  );

  const rowsToUpsert = generated
    .filter((g) => g.note)
    .map((g) => ({
      horse_id: g.id,
      comment: g.note!.comment,
      score_adjustment: g.note!.scoreAdjustment,
      fetched_at: new Date().toISOString(),
    }));

  if (rowsToUpsert.length > 0) {
    await supabase.from("horse_ai_notes").upsert(rowsToUpsert, { onConflict: "horse_id" });
  }

  for (const g of generated) {
    if (g.note) notes[g.id] = g.note;
  }

  return notes;
}

// Claude Haikuで1頭分の一言コメント+スコア補正を生成する。
async function generateHorseNote(
  horseName: string,
  pastRaces: PastRace[]
): Promise<{ comment: string; scoreAdjustment: number } | null> {
  // JV-Dataは未確定の値を"00"/"999"のような0埋め・番兵値で表す(着順・人気・上がり3F)。
  // 素直に文字列の真偽値やNumber()だけで判定すると"00"がtruthyになったり、
  // 999(=上がり99.9秒、実際にはあり得ない番兵値)がそのまま渡ってしまい、
  // AIが「0着=1着」のように事実と異なる短評を生成する原因になっていた。
  const raceLines = pastRaces
    .map((r) => {
      const finishNum = Number(r.kakutei_chakujun);
      const finish = Number.isFinite(finishNum) && finishNum > 0 ? `${finishNum}着` : "着順不明";
      const ninkiNum = Number(r.tansho_ninkijun);
      const ninki = Number.isFinite(ninkiNum) && ninkiNum > 0 ? `${ninkiNum}番人気` : "人気不明";
      const kohanNum = Number(r.kohan_3f);
      const kohan3f = Number.isFinite(kohanNum) && kohanNum > 0 && kohanNum < 900 ? `上がり${(kohanNum / 10).toFixed(1)}秒` : "";
      if (finish === "着順不明" && ninki === "人気不明" && !kohan3f) return null;
      return `${finish}(${ninki})${kohan3f ? " " + kohan3f : ""}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
  const userText = `馬名: ${horseName}\n直近成績(新しい順):\n${raceLines || "データなし"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: NOTE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.content?.[0]?.text ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    if (typeof parsed.comment !== "string") return null;
    const scoreAdjustment = Number.isFinite(parsed.scoreAdjustment) ? Math.round(parsed.scoreAdjustment) : 0;
    return { comment: parsed.comment, scoreAdjustment: Math.max(-5, Math.min(5, scoreAdjustment)) };
  } catch {
    return null;
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
