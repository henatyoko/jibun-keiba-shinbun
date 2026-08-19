import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import GradeChip from "./GradeChip";
import { PAPER_CARD, INK, MUTED } from "../lib/colors";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(rawDate) {
  const d = new Date(`${rawDate}T00:00:00+09:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export default function RaceList({ races, onSelect }) {
  const dates = [...new Set(races.map((r) => r.rawDate).filter(Boolean))].sort();
  const [date, setDate] = useState(dates[0] ?? null);

  const racesOnDate = date ? races.filter((r) => r.rawDate === date) : races;
  const places = [...new Set(racesOnDate.map((r) => r.place))];
  const [place, setPlace] = useState(places[0] ?? null);

  // レースデータが変わって今の選択日/場所が無くなった場合、先頭に戻す
  useEffect(() => {
    if (dates.length > 0 && !dates.includes(date)) {
      setDate(dates[0]);
    }
  }, [races]);

  useEffect(() => {
    if (places.length > 0 && !places.includes(place)) {
      setPlace(places[0]);
    }
  }, [date, races]);

  const visibleRaces = place ? racesOnDate.filter((r) => r.place === place) : racesOnDate;

  return (
    <div className="px-4 pt-4 pb-24">
      <p className="text-xs mb-3" style={{ color: MUTED }}>
        あなたの知見を反映した予想スコアで表示
      </p>

      {races[0]?.isPastReview && (
        <div className="mb-3 px-3 py-2 text-xs" style={{ background: PAPER_CARD, border: `1px solid ${MUTED}`, color: MUTED }}>
          次の開催データがまだ取り込まれていないため、直近開催({formatDateLabel(races[0].rawDate)})の結果を振り返り表示しています
        </div>
      )}

      {dates.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto">
          {dates.map((d) => (
            <button
              key={d}
              onClick={() => setDate(d)}
              className="px-3 py-1.5 text-sm font-semibold shrink-0"
              style={{
                background: date === d ? "#A9342A" : "transparent",
                color: date === d ? "#F1E9D8" : INK,
                border: `1px solid ${date === d ? "#A9342A" : MUTED}`,
                fontFamily: "'Shippori Mincho', serif",
              }}
            >
              {formatDateLabel(d)}
            </button>
          ))}
        </div>
      )}

      {places.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {places.map((p) => (
            <button
              key={p}
              onClick={() => setPlace(p)}
              className="px-3 py-1.5 text-sm font-semibold shrink-0"
              style={{
                background: place === p ? INK : "transparent",
                color: place === p ? "#F1E9D8" : INK,
                border: `1px solid ${place === p ? INK : MUTED}`,
                fontFamily: "'Shippori Mincho', serif",
              }}
            >
              {p}
            </button>
          ))}
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
          </button>
        ))}
      </div>
    </div>
  );
}
