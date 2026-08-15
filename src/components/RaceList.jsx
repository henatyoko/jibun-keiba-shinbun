import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import GradeChip from "./GradeChip";
import { PAPER_CARD, INK, MUTED } from "../lib/colors";

export default function RaceList({ races, onSelect }) {
  const places = [...new Set(races.map((r) => r.place))];
  const [place, setPlace] = useState(places[0] ?? null);

  // レースデータが変わって今の選択場所が無くなった場合、先頭の場所に戻す
  useEffect(() => {
    if (places.length > 0 && !places.includes(place)) {
      setPlace(places[0]);
    }
  }, [races]);

  const visibleRaces = place ? races.filter((r) => r.place === place) : races;

  return (
    <div className="px-4 pt-4 pb-24">
      <p className="text-xs mb-3" style={{ color: MUTED }}>
        あなたの知見を反映した予想スコアで表示
      </p>

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
