import { useMemo } from "react";
import GradeChip from "./GradeChip";
import WakuBadge from "./WakuBadge";
import { scoreHorse } from "../lib/scoring";
import { PAPER_CARD, INK, RED, MUTED, LINE, MARKS } from "../lib/colors";

export default function RaceDetail({ race, attrRules, trendRules, onBack }) {
  const scored = useMemo(() => {
    return race.horses
      .map((h) => ({ ...h, ...scoreHorse(h, attrRules, trendRules, race.name) }))
      .sort((a, b) => b.total - a.total);
  }, [race, attrRules, trendRules]);

  return (
    <div className="px-4 pt-4 pb-24">
      <button onClick={onBack} className="text-xs mb-3 font-semibold" style={{ color: RED }}>
        ← レース一覧に戻る
      </button>
      <div className="flex items-center gap-2 mb-1">
        <GradeChip grade={race.grade} />
        <span className="text-xs" style={{ color: MUTED }}>
          {race.date}
        </span>
      </div>
      <h1 className="text-xl font-bold mb-1" style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}>
        {race.name}
      </h1>
      <p className="text-xs mb-4" style={{ color: MUTED }}>
        {race.place}
        {race.raceNumber ? `${race.raceNumber}R` : ""}・{race.distance}
      </p>

      <div style={{ border: `1.5px solid ${INK}` }}>
        {scored.map((h, idx) => (
          <div
            key={h.num}
            className="p-3"
            style={{
              background: idx === 0 ? "#F3E4C8" : PAPER_CARD,
              borderBottom: idx < scored.length - 1 ? `1px solid ${LINE}` : "none",
            }}
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              <div
                className="text-xl font-black w-6 text-center shrink-0"
                style={{ color: idx === 0 ? RED : INK, fontFamily: "'Shippori Mincho', serif" }}
              >
                {MARKS[idx] || ""}
              </div>
              <WakuBadge num={h.num} />
              <div className="flex-1">
                <div className="font-bold text-[15px]" style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}>
                  {h.name}
                </div>
                <div className="text-[10px]" style={{ color: MUTED }}>
                  {h.age}歳・{h.jockey}・{h.sire}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-xl font-black tabular-nums"
                  style={{ color: idx === 0 ? RED : INK, fontFamily: "'Shippori Mincho', serif" }}
                >
                  {h.total}
                </div>
                <div className="text-[9px]" style={{ color: MUTED }}>
                  基礎{h.base}
                </div>
              </div>
            </div>

            {h.applied.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-[62px]">
                {h.applied.map((a, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 font-semibold"
                    style={{
                      border: `1px solid ${a.score > 0 ? INK : RED}`,
                      color: a.score > 0 ? INK : RED,
                    }}
                  >
                    {a.label} {a.score > 0 ? "+" : ""}
                    {a.score}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
