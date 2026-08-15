import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import GradeChip from "./GradeChip";
import WakuBadge from "./WakuBadge";
import { scoreHorse, baseScoreFromPastRaces, courseBiasAdjustment } from "../lib/scoring";
import { fetchHorsePastRaces } from "../lib/horsePastRepository";
import { PAPER_CARD, INK, RED, MUTED, LINE, MARKS } from "../lib/colors";

export default function RaceDetail({ race, attrRules, trendRules, onBack }) {
  const [pastRacesByHorse, setPastRacesByHorse] = useState({});
  const [notesByHorse, setNotesByHorse] = useState({});
  const [siresByHorse, setSiresByHorse] = useState({});
  const [loadingPast, setLoadingPast] = useState(true);

  useEffect(() => {
    setLoadingPast(true);
    fetchHorsePastRaces(race.horses).then(({ past, notes, sires }) => {
      setPastRacesByHorse(past);
      setNotesByHorse(notes);
      setSiresByHorse(sires);
      setLoadingPast(false);
    });
  }, [race]);

  const scored = useMemo(() => {
    return race.horses
      .map((h) => {
        const past = pastRacesByHorse[h.horseId];
        const base = past ? baseScoreFromPastRaces(past) : h.base;
        const note = notesByHorse[h.horseId];
        const sire = siresByHorse[h.horseId] || h.sire;
        const { total, bonus, applied } = scoreHorse({ ...h, base, sire }, attrRules, trendRules, race.name);
        const aiAdjustment = note?.scoreAdjustment ?? 0;
        const bias = courseBiasAdjustment(h.waku, race.place, race.distance);
        const extra = [
          ...(aiAdjustment !== 0 ? [{ label: "AI評価", score: aiAdjustment }] : []),
          ...(bias ? [{ label: bias.label, score: bias.score }] : []),
        ];
        const extraTotal = aiAdjustment + (bias?.score ?? 0);
        return {
          ...h,
          base,
          past,
          note,
          sire,
          total: total + extraTotal,
          bonus: bonus + extraTotal,
          applied: [...applied, ...extra],
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [race, attrRules, trendRules, pastRacesByHorse, notesByHorse, siresByHorse]);

  return (
    <div className="px-4 pt-4 pb-24">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-3 px-3 py-2 text-sm font-bold active:opacity-70 transition-opacity"
        style={{ color: PAPER_CARD, background: RED, border: `1px solid ${RED}` }}
      >
        <ChevronLeft size={18} />
        レース一覧に戻る
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
      <p className="text-xs mb-1" style={{ color: MUTED }}>
        {race.place}
        {race.raceNumber ? `${race.raceNumber}R` : ""}・{race.distance}
      </p>
      {loadingPast && (
        <p className="text-[10px] mb-3" style={{ color: MUTED }}>
          過去成績を取得中…
        </p>
      )}

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
                {h.past && h.past.length > 0 && (
                  <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: MUTED }}>
                    <span>近{h.past.length}走:</span>
                    <span className="flex gap-1">
                      {h.past.map((r, i) => (
                        <span
                          key={i}
                          className="font-bold"
                          style={{ color: r.finish_position === 1 ? RED : r.finish_position && r.finish_position <= 3 ? INK : MUTED }}
                        >
                          {r.finish_position ?? "?"}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {h.note?.comment && (
                  <p className="text-[10px] mt-0.5 italic" style={{ color: MUTED }}>
                    「{h.note.comment}」
                  </p>
                )}
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
