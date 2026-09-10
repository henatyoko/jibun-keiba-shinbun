import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import GradeChip from "./GradeChip";
import { computeMarkAccuracy } from "../lib/markAccuracyRepository";
import { PAPER, PAPER_CARD, INK, RED, MUTED } from "../lib/colors";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(rawDate) {
  const d = new Date(`${rawDate}T00:00:00+09:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

// selectedDate/selectedPlaceはURL(ルーティング側)が正とするcontrolledな値。
// 未指定または現在のracesに存在しない場合は、呼び出し側(App.jsx)が既定値へ
// リダイレクトする前提のため、ここでは決定間のフォールバック表示だけ行う。
export default function RaceList({
  races,
  attrRules,
  trendRules,
  onSelect,
  showFallbackNotice = true,
  selectedDate,
  selectedPlace,
  onDateChange,
  onPlaceChange,
}) {
  const dates = [...new Set(races.map((r) => r.rawDate).filter(Boolean))].sort();
  const date = dates.includes(selectedDate) ? selectedDate : dates[0] ?? null;

  const racesOnDate = date ? races.filter((r) => r.rawDate === date) : races;
  const places = [...new Set(racesOnDate.map((r) => r.place))];
  const place = places.includes(selectedPlace) ? selectedPlace : places[0] ?? null;

  // ページタイトルに日付・会場を反映する(SEO・タブ判別用)
  useEffect(() => {
    if (!date || !place) return;
    document.title = `${formatDateLabel(date)} ${place} | じぶん競馬新聞`;
    return () => {
      document.title = "じぶん競馬新聞";
    };
  }, [date, place]);

  const [markAccuracy, setMarkAccuracy] = useState(null);

  // 振り返り表示の時だけ、印(◎○▲)ごとの3位以内的中率を集計する
  useEffect(() => {
    if (!races[0]?.isPastReview) {
      setMarkAccuracy(null);
      return;
    }
    let cancelled = false;
    computeMarkAccuracy(races, attrRules ?? [], trendRules ?? []).then((result) => {
      if (!cancelled) setMarkAccuracy(result);
    });
    return () => {
      cancelled = true;
    };
  }, [races, attrRules, trendRules]);

  const visibleRaces = place ? racesOnDate.filter((r) => r.place === place) : racesOnDate;

  return (
    <div className="px-4 pt-4 pb-24">
      <p className="text-xs mb-3" style={{ color: MUTED }}>
        あなたの知見を反映した予想スコアで表示
      </p>

      {showFallbackNotice && races[0]?.isPastReview && (
        <div className="mb-3 px-3 py-2 text-xs" style={{ background: PAPER_CARD, border: `1px solid ${MUTED}`, color: MUTED }}>
          次の開催データがまだ取り込まれていないため、直近開催(
          {dates.length > 1 ? `${formatDateLabel(dates[0])}〜${formatDateLabel(dates[dates.length - 1])}` : formatDateLabel(dates[0])}
          )の結果を振り返り表示しています
        </div>
      )}

      {markAccuracy && (
        <div className="mb-3 flex gap-2 flex-wrap">
          {["◎", "○", "▲", "△", "穴"].map((mark) => {
            const stat = markAccuracy[mark];
            if (!stat || stat.total === 0) return null;
            const rate = Math.round((stat.hit / stat.total) * 100);
            return (
              <div
                key={mark}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{ border: `1px solid ${INK}`, color: INK }}
              >
                <span style={{ color: RED, fontFamily: "'Shippori Mincho', serif" }}>{mark}</span> 3位以内 {stat.hit}/
                {stat.total}({rate}%)
              </div>
            );
          })}
        </div>
      )}

      {dates.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto">
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => onDateChange?.(d)}
              className="px-3 py-1.5 text-sm font-semibold shrink-0"
              style={{
                background: date === d ? RED : "transparent",
                color: date === d ? PAPER : INK,
                border: `1px solid ${date === d ? RED : MUTED}`,
                fontFamily: "'Shippori Mincho', serif",
              }}
            >
              {formatDateLabel(d)}
            </button>
          ))}
        </div>
      )}

      {places.length > 1 && (
        <div className="mb-4 relative inline-block">
          <select
            value={place ?? ""}
            onChange={(e) => onPlaceChange?.(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm font-semibold"
            style={{
              background: INK,
              color: PAPER,
              border: `1px solid ${INK}`,
              fontFamily: "'Shippori Mincho', serif",
            }}
          >
            {places.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <ChevronDown size={16} color={PAPER} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
        </div>
      )}

      <div className="space-y-3">
        {visibleRaces.map((race) => (
          <button
            key={race.id}
            onClick={() => onSelect(race)}
            className="w-full text-left p-4 active:opacity-70 transition-opacity"
            style={{ background: PAPER_CARD, border: `1px solid ${INK}` }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <GradeChip grade={race.grade} />
                <span className="text-xs" style={{ color: MUTED, fontFamily: "'Shippori Mincho', serif" }}>
                  {race.date}
                </span>
              </div>
              <ChevronRight size={16} color={INK} />
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}>
              {race.name}
            </h2>
            <p className="text-xs" style={{ color: MUTED }}>
              {race.place}
              {race.raceNumber ? `${race.raceNumber}R` : ""}・{race.distance}
            </p>
            {race.isPastReview && (() => {
              const top3 = race.horses
                .filter((h) => h.result && h.result <= 3)
                .sort((a, b) => a.result - b.result);
              if (top3.length === 0) return null;
              return (
                <p className="text-xs mt-1.5 font-semibold" style={{ color: INK }}>
                  {top3.map((h) => `${h.result}着 ${h.num || "-"} ${h.name}`).join(" / ")}
                </p>
              );
            })()}
          </button>
        ))}
      </div>
    </div>
  );
}
