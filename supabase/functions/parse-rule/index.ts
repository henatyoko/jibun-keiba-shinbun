// 自由文の知見(例:「菊花賞は3歳馬が来ない、-5点」)をClaude APIで構造化ルールに変換するEdge Function。
// 呼び出しにはSupabaseの認証(JWT)が必須(ログイン中のユーザーのみ利用可能)。

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const SYSTEM_PROMPT = `あなたは競馬予想アプリ「じぶん競馬新聞」の知見ルールを解析するアシスタントです。
ユーザーが自由な日本語で入力した競馬の知見を、以下のどちらかのJSON形式に変換してください。

属性ルール(馬・血統・騎手・厩舎に紐づく評価):
{"kind":"attr","type":"血統"|"騎手"|"厩舎","value":"対象の名前","score":整数}

傾向ルール(特定レース・条件に紐づく法則):
{"kind":"trend","race":"レース名","type":"馬齢"|"枠番"|"脚質","value":"条件値(例:3歳、8枠以降)","score":整数,"label":"短い説明"}

出力はJSONオブジェクトのみとし、説明文やコードブロックは付けないでください。
scoreは文中に明記されていればその値を、無ければ文脈から-10〜10の範囲で妥当な整数を推定してください。
属性ルールか傾向ルールか、あるいはどちらとも解釈できず解析できない場合は
{"error":"理由"} を返してください。`;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "リクエストの形式が不正です" }, 400);
  }

  const text = body?.text;
  if (!text || typeof text !== "string") {
    return json({ error: "textが必要です" }, 400);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return json({ error: `Claude APIエラー: ${errText}` }, 502);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "";
  // Claudeの応答がコードブロックや前後の説明文で囲まれている場合に備えて、
  // 最初の "{" から最後の "}" までを抜き出してからパースする。
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : content;

  try {
    const parsed = JSON.parse(jsonText);
    return json(parsed, 200);
  } catch {
    return json({ error: `解析結果の読み取りに失敗しました: ${content.slice(0, 200)}` }, 502);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
