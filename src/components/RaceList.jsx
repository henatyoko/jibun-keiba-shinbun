import { ChevronRight } from "lucide-react";
import GradeChip from "./GradeChip";
import { PAPER_CARD, INK, MUTED } from "../lib/colors";

export default function RaceList({ races, onSelect }) {
  return (
    <div className="px-4 pt-4 pb-24 space-y-3">
      <p className="text-xs mb-1" style={{ color: MUTED }}>
        あなたの知見を反映した予想スコアで表示
      </p>
      {races.map((race) => (
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
            {race.place}・{race.distance}
          </p>
        </button>
      ))}
    </div>
  );
}
