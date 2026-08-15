// レース詳細を開いた時に、その場で対象馬の過去5走(着順つき)をnetkeibaから取得してキャッシュし、
// あわせてClaude Haikuで一言コメント+スコア補正を生成してキャッシュするEdge Function。
// 3日以内にキャッシュ済みの馬(過去成績・AIコメントとも)は再取得しない(低頻度アクセス・低コストを保つため)。

import { createClient } from "npm:@supabase/supabase-js@2";
import * as cheerio from "npm:cheerio@1";
import iconv from "npm:iconv-lite@0.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const HEADERS = {
  "User-Agent": "jibun-keiba-shinbun-scraper/1.0 (personal, low-frequency, private use)",
};

const CACHE_HOURS = 72;

const NOTE_SYSTEM_PROMPT = `あなたは競馬新聞のベテラン記者です。1頭の馬の直近成績データを見て、
競馬新聞の「短評」欄のような一言コメント(20〜40字程度、体言止めや新聞調でよい)と、
その馬の今の調子を反映したスコア補正(-5〜+5の整数、絶好調なら+、不振なら-、
互角なら0に近い値)をJSONで返してください。

出力は次のJSON形式のみとし、説明文やコードブロックは付けないでください。
{"comment":"短評文","scoreAdjustment":整数}

データが乏しく判断できない場合は {"comment":"データ不足のため判断できず","scoreAdjustment":0} を返してください。`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  const horseIds: string[] = Array.isArray(body?.horseIds) ? body.horseIds.filter(Boolean) : [];
  if (horseIds.length === 0) {
    return json({ error: "horseIdsが必要です" }, 400);
  }
  const horseNames: Record<string, string> =
    body?.horseNames && typeof body.horseNames === "object" ? body.horseNames : {};

  const staleBefore = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString();

  // 過去成績→AIコメント生成のパイプライン、血統(父馬名)取得、調教師・馬主取得は
  // 互いに依存しないので並行して走らせる(それぞれの内部でも並列化している)。
  try {
    const [{ grouped, notes }, sires, profiles] = await Promise.all([
      getPastRacesAndNotes(horseIds, horseNames, staleBefore),
      getOrFetchSires(horseIds),
      getOrFetchProfiles(horseIds),
    ]);
    return json({ past: grouped, notes, sires, profiles }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "取得に失敗しました" }, 500);
  }
});

async function getPastRacesAndNotes(
  horseIds: string[],
  horseNames: Record<string, string>,
  staleBefore: string
): Promise<{ grouped: Record<string, unknown[]>; notes: Record<string, { comment: string; scoreAdjustment: number }> }> {
  const { data: cachedFreshness } = await supabase
    .from("horse_past_races")
    .select("horse_id, fetched_at")
    .in("horse_id", horseIds)
    .order("fetched_at", { ascending: false });

  const staleHorseIds = horseIds.filter((id) => {
    const latest = cachedFreshness?.find((c) => c.horse_id === id);
    return !latest || latest.fetched_at <= staleBefore;
  });

  // 未キャッシュ・期限切れの馬だけ、netkeibaへの取得を並列に行う(1レース開くたびに
  // 最大でも出走頭数分=十数件程度なので、低頻度アクセスの範囲内)。
  await Promise.all(
    staleHorseIds.map(async (horseId) => {
      const races = await fetchHorsePastRaces(horseId);
      if (races.length === 0) return;
      await supabase
        .from("horse_past_races")
        .upsert(
          races.map((r) => ({ ...r, horse_id: horseId })),
          { onConflict: "horse_id,race_date,race_name" }
        );
    })
  );

  const { data, error } = await supabase
    .from("horse_past_races")
    .select("horse_id, race_date, place, distance, finish_position, headcount, race_name")
    .in("horse_id", horseIds)
    .order("race_date", { ascending: false });

  if (error) throw new Error(error.message);

  const grouped: Record<string, unknown[]> = {};
  for (const row of data) {
    (grouped[row.horse_id] ??= []).push(row);
  }
  for (const id of horseIds) {
    grouped[id] = (grouped[id] ?? []).slice(0, 5);
  }

  const notes = await getOrGenerateHorseNotes(horseIds, grouped, horseNames, staleBefore);

  return { grouped, notes };
}

// 各馬の父馬名(血統)を取得。父は不変なので一度キャッシュしたら再取得しない。
// 新馬(過去成績が無い馬)でも血統ルールでスコアリングできるようにするための情報。
async function getOrFetchSires(horseIds: string[]): Promise<Record<string, string>> {
  const { data: cached } = await supabase
    .from("horse_sires")
    .select("horse_id, sire")
    .in("horse_id", horseIds);

  const sires: Record<string, string> = {};
  const missingIds: string[] = [];

  for (const id of horseIds) {
    const row = cached?.find((c) => c.horse_id === id);
    if (row) sires[id] = row.sire;
    else missingIds.push(id);
  }

  await Promise.all(
    missingIds.map(async (id) => {
      const sire = await fetchSire(id);
      if (!sire) return;
      sires[id] = sire;
      await supabase.from("horse_sires").upsert({ horse_id: id, sire }, { onConflict: "horse_id" });
    })
  );

  return sires;
}

// netkeibaの血統ページ(ログイン不要)から父馬名だけを抜き出す。
// 5代血統表は先頭行の最初のtdが必ず父にあたる(rowspanで系統樹の上半分を占める)。
async function fetchSire(horseId: string): Promise<string | null> {
  try {
    const url = `https://db.netkeiba.com/horse/ped/${horseId}/`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const html = iconv.decode(buf as any, "euc-jp");
    const $ = cheerio.load(html);

    const firstTd = $(".blood_table").first().find("tr").first().find("td").first();
    const sireLink = firstTd.find("a").first();
    const sire = sireLink.contents().first().text().trim();
    return sire || null;
  } catch {
    return null;
  }
}

type HorseProfile = { trainer: string | null; owner: string | null };

// 各馬の調教師(厩舎)・馬主を取得。不変なので一度キャッシュしたら再取得しない。
async function getOrFetchProfiles(horseIds: string[]): Promise<Record<string, HorseProfile>> {
  const { data: cached } = await supabase
    .from("horse_profiles")
    .select("horse_id, trainer, owner")
    .in("horse_id", horseIds);

  const profiles: Record<string, HorseProfile> = {};
  const missingIds: string[] = [];

  for (const id of horseIds) {
    const row = cached?.find((c) => c.horse_id === id);
    if (row) profiles[id] = { trainer: row.trainer, owner: row.owner };
    else missingIds.push(id);
  }

  await Promise.all(
    missingIds.map(async (id) => {
      const profile = await fetchProfile(id);
      if (!profile) return;
      profiles[id] = profile;
      await supabase
        .from("horse_profiles")
        .upsert({ horse_id: id, trainer: profile.trainer, owner: profile.owner }, { onConflict: "horse_id" });
    })
  );

  return profiles;
}

// netkeibaの馬プロフィールページ(ログイン不要)から調教師・馬主を抜き出す。
async function fetchProfile(horseId: string): Promise<HorseProfile | null> {
  try {
    const url = `https://db.netkeiba.com/horse/${horseId}/`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const html = iconv.decode(buf as any, "euc-jp");
    const $ = cheerio.load(html);

    let trainer: string | null = null;
    let owner: string | null = null;
    $(".db_prof_table")
      .first()
      .find("tr")
      .each((_, row) => {
        const label = $(row).find("th").text().trim();
        const value = $(row).find("td").text().replace(/\s+/g, " ").trim();
        if (label === "調教師") trainer = value.replace(/\s*\([^)]*\)\s*$/, "").trim() || null;
        if (label === "馬主") owner = value || null;
      });

    if (!trainer && !owner) return null;
    return { trainer, owner };
  } catch {
    return null;
  }
}

// 各馬のAI一言コメント+スコア補正を取得。3日以内のキャッシュがあれば再生成しない。
async function getOrGenerateHorseNotes(
  horseIds: string[],
  pastByHorse: Record<string, unknown[]>,
  horseNames: Record<string, string>,
  staleBefore: string
): Promise<Record<string, { comment: string; scoreAdjustment: number }>> {
  const { data: cachedNotes } = await supabase
    .from("horse_ai_notes")
    .select("horse_id, comment, score_adjustment, fetched_at")
    .in("horse_id", horseIds);

  const notes: Record<string, { comment: string; scoreAdjustment: number }> = {};
  const staleIds: string[] = [];

  for (const id of horseIds) {
    const row = cachedNotes?.find((n) => n.horse_id === id);
    if (row && row.fetched_at > staleBefore) {
      notes[id] = { comment: row.comment, scoreAdjustment: row.score_adjustment };
    } else if ((pastByHorse[id]?.length ?? 0) > 0) {
      staleIds.push(id);
    }
  }

  if (staleIds.length === 0 || !ANTHROPIC_API_KEY) return notes;

  const generated = await Promise.all(
    staleIds.map(async (id) => {
      const note = await generateHorseNote(horseNames[id] ?? id, pastByHorse[id] as any[]);
      return { id, note };
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
  pastRaces: { race_date: string; place: string | null; finish_position: number | null; headcount: number | null; race_name: string | null }[]
): Promise<{ comment: string; scoreAdjustment: number } | null> {
  const raceLines = pastRaces
    .map((r) => `${r.race_date} ${r.place ?? ""} ${r.race_name ?? ""} ${r.finish_position ?? "?"}着/${r.headcount ?? "?"}頭`)
    .join("\n");
  const userText = `馬名: ${horseName}\n直近成績:\n${raceLines || "データなし"}`;

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

async function fetchHorsePastRaces(horseId: string) {
  const url = `https://db.netkeiba.com/horse/ajax_horse_results.html?input=UTF-8&output=json&id=${horseId}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];
  const json = await res.json();
  if (json?.status !== "OK" || !json.data) return [];
  const $ = cheerio.load(json.data);

  const table = $(".db_h_race_results").first();
  if (table.length === 0) return [];

  const races: {
    race_date: string;
    place: string | null;
    distance: string | null;
    finish_position: number | null;
    headcount: number | null;
    race_name: string | null;
  }[] = [];

  table
    .find("tr")
    .slice(1, 6) // ヘッダーを除いた直近5走
    .each((_, row) => {
      const cells = $(row)
        .children()
        .map((_i, c) => $(c).text().replace(/\s+/g, " ").trim())
        .get();
      const dateMatch = cells[0]?.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      if (!dateMatch) return;
      const raceDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
      const place = cells[1] || null;
      const raceName = cells[4] || null;
      const headcount = Number(cells[6]) || null;
      const finishPosition = Number(cells[11]) || null;
      const distance = cells[14] || null;

      races.push({
        race_date: raceDate,
        place,
        distance,
        finish_position: finishPosition,
        headcount,
        race_name: raceName,
      });
    });

  return races;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
