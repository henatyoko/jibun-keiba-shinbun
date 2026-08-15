// レース詳細を開いた時に、その場で対象馬の過去5走(着順つき)をnetkeibaから取得してキャッシュするEdge Function。
// 3日以内にキャッシュ済みの馬は再取得しない(低頻度アクセスを保つため)。

import { createClient } from "npm:@supabase/supabase-js@2";
import * as cheerio from "npm:cheerio@1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const HEADERS = {
  "User-Agent": "jibun-keiba-shinbun-scraper/1.0 (personal, low-frequency, private use)",
};

const CACHE_HOURS = 72;

Deno.serve(async (req) => {
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

  const staleBefore = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString();

  for (const horseId of horseIds) {
    const { data: cached } = await supabase
      .from("horse_past_races")
      .select("fetched_at")
      .eq("horse_id", horseId)
      .order("fetched_at", { ascending: false })
      .limit(1);

    const isFresh = cached && cached.length > 0 && cached[0].fetched_at > staleBefore;
    if (isFresh) continue;

    const races = await fetchHorsePastRaces(horseId);
    if (races.length === 0) continue;

    await supabase
      .from("horse_past_races")
      .upsert(
        races.map((r) => ({ ...r, horse_id: horseId })),
        { onConflict: "horse_id,race_date,race_name" }
      );
  }

  const { data, error } = await supabase
    .from("horse_past_races")
    .select("horse_id, race_date, place, distance, finish_position, headcount, race_name")
    .in("horse_id", horseIds)
    .order("race_date", { ascending: false });

  if (error) return json({ error: error.message }, 500);

  const grouped: Record<string, unknown[]> = {};
  for (const row of data) {
    (grouped[row.horse_id] ??= []).push(row);
  }
  for (const id of horseIds) {
    grouped[id] = (grouped[id] ?? []).slice(0, 5);
  }

  return json(grouped, 200);
});

async function fetchHorsePastRaces(horseId: string) {
  const res = await fetch(`https://db.netkeiba.com/horse/${horseId}/`, { headers: HEADERS });
  if (!res.ok) return [];
  const html = await res.text();
  const $ = cheerio.load(html);

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
    headers: { "Content-Type": "application/json" },
  });
}
