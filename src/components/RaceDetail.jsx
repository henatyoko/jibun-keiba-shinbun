import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import GradeChip from "./GradeChip";
import WakuBadge from "./WakuBadge";
import { scoreHorse, baseScoreFromPastRaces, courseBiasAdjustment, paddockAdjustment } from "../lib/scoring";
import { fetchHorsePastRaces } from "../lib/horsePastRepository";
import { fetchPaddockGrades, setPaddockGrade as savePaddockGrade } from "../lib/paddockRepository";
import { PAPER_CARD, INK, RED, MUTED, LINE, MARKS } from "../lib/colors";

const PADDOCK_GRADES = ["A", "B", "無印"];

export default function RaceDetail({ race, races, attrRules, trendRules, userId, onBack, onNavigate }) {
  const [pastRacesByHorse, setPastRacesByHorse] = useState({});
  const [notesByHorse, setNotesByHorse] = useState({});
  const [siresByHorse, setSiresByHorse] = useState({});
  const [profilesByHorse, setProfilesByHorse] = useState({});
  const [paddockByNum, setPaddockByNum] = useState({});
  const [loadingPast, setLoadingPast] = useState(true);

  // レースが切り替わった時、前のレースでのスクロール位置を引き継がず一番上に戻す
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [race.id]);

  // 同じ開催日・同じ競馬場のレースをレース番号順に並べ、前後移動に使う。
  const { prevRace, nextRace } = useMemo(() => {
    if (!races) return { prevRace: null, nextRace: null };
    const siblings = races
      .filter((r) => r.place === race.place && r.rawDate === race.rawDate)
      .sort((a, b) => (a.raceNumber ?? 0) - (b.raceNumber ?? 0));
    const idx = siblings.findIndex((r) => r.id === race.id);
    return {
      prevRace: idx > 0 ? siblings[idx - 1] : null,
      nextRace: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
    };
  }, [races, race]);

  useEffect(() => {
    setLoadingPast(true);
    fetchHorsePastRaces(race.horses).then(({ past, notes, sires, profiles }) => {
      setPastRacesByHorse(past);
      setNotesByHorse(notes);
      setSiresByHorse(sires);
      setProfilesByHorse(profiles);
      setLoadingPast(false);
    });
  }, [race]);

  // 自分で入力したパドック評価を読み込む(ログイン中のみ)
  useEffect(() => {
    if (!userId) {
      setPaddockByNum({});
      return;
    }
    fetchPaddockGrades(userId, race.id).then(setPaddockByNum);
  }, [race.id, userId]);

  const handlePaddockGrade = (num, grade) => {
    if (!userId) return;
    setPaddockByNum((prev) => {
      const next = { ...prev };
      if (grade) next[num] = grade;
      else delete next[num];
      return next;
    });
    savePaddockGrade(userId, race.id, num, grade).catch(() => {});
  };

  const scored = useMemo(() => {
    return race.horses
      .map((h) => {
        const past = pastRacesByHorse[h.horseId];
        const base = past ? baseScoreFromPastRaces(past) : h.base;
        const note = notesByHorse[h.horseId];
        const sire = siresByHorse[h.horseId] || h.sire;
        const profile = profilesByHorse[h.horseId];
        const trainer = profile?.trainer;
        const owner = profile?.owner;
        const { total, bonus, applied } = scoreHorse(
          { ...h, base, sire, trainer, owner },
          attrRules,
          trendRules,
          race.name
        );
        const aiAdjustment = note?.scoreAdjustment ?? 0;
        const bias = courseBiasAdjustment(h.waku, race.place, race.distance);
        const paddockGrade = paddockByNum[h.num];
        const paddock = paddockAdjustment(paddockGrade);
        const extra = [
          ...(aiAdjustment !== 0 ? [{ label: "AI評価", score: aiAdjustment }] : []),
          ...(bias ? [{ label: bias.label, score: bias.score }] : []),
          ...(paddock ? [{ label: paddock.label, score: paddock.score }] : []),
        ];
        const extraTotal = aiAdjustment + (bias?.score ?? 0) + (paddock?.score ?? 0);
        const hasPastData = Boolean(past && past.length > 0);
        return {
          ...h,
          base,
          past,
          note,
          sire,
          trainer,
          paddockGrade,
          owner,
          hasPastData,
          total: total + extraTotal,
          bonus: bonus + extraTotal,
          applied: [...applied, ...extra],
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [race, attrRules, trendRules, pastRacesByHorse, notesByHorse, siresByHorse, profilesByHorse, paddockByNum]);

  // 新馬戦などで過去データも補正も無く全馬横並びの時は、枠番順がそのまま印になって
  // 紛らわしいため印・強調表示を出さない
  const noDifferentiation = !loadingPast && scored.every((h) => !h.hasPastData && h.applied.length === 0);

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold active:opacity-70 transition-opacity"
          style={{ color: PAPER_CARD, background: RED, border: `1px solid ${RED}` }}
        >
          <ChevronLeft size={18} />
          レース一覧に戻る
        </button>
        <div className="flex-1" />
        <button
          onClick={() => prevRace && onNavigate(prevRace)}
          disabled={!prevRace}
          className="flex items-center px-2 py-2 text-sm font-bold active:opacity-70 transition-opacity disabled:opacity-30"
          style={{ color: INK, border: `1px solid ${INK}` }}
        >
          <ChevronLeft size={18} />
          {prevRace?.raceNumber ? `${prevRace.raceNumber}R` : ""}
        </button>
        <button
          onClick={() => nextRace && onNavigate(nextRace)}
          disabled={!nextRace}
          className="flex items-center px-2 py-2 text-sm font-bold active:opacity-70 transition-opacity disabled:opacity-30"
          style={{ color: INK, border: `1px solid ${INK}` }}
        >
          {nextRace?.raceNumber ? `${nextRace.raceNumber}R` : ""}
          <ChevronRight size={18} />
        </button>
      </div>
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
      <div className="relative">
        {loadingPast && (
          <div
            className="fixed inset-0 z-[5] flex flex-col items-center justify-center gap-2"
            style={{ background: "rgba(241, 233, 216, 0.9)" }}
          >
            <div className="horse-run-track">
              <span>🐎</span>
            </div>
            <p className="text-xs" style={{ color: MUTED }}>
              過去成績・血統・AI評価を取得中…
            </p>
          </div>
        )}
      <div style={{ border: `1.5px solid ${INK}` }}>
        {scored.map((h, idx) => (
          <div
            key={h.num}
            className="p-3"
            style={{
              background: idx === 0 && !noDifferentiation ? "#F3E4C8" : PAPER_CARD,
              borderBottom: idx < scored.length - 1 ? `1px solid ${LINE}` : "none",
              minHeight: "150px",
            }}
          >
            <div className="flex items-start gap-2.5 mb-1.5">
              <div
                className="font-black w-6 text-center shrink-0"
                style={{ color: idx === 0 && !noDifferentiation ? RED : INK, fontFamily: "'Shippori Mincho', serif", fontSize: "20px" }}
              >
                {noDifferentiation ? "" : MARKS[idx] || ""}
              </div>
              <WakuBadge num={h.num} />
              <div className="flex-1">
                <div className="font-bold text-[0.9375rem]" style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}>
                  {h.name}
                </div>
                <div className="text-[0.625rem]" style={{ color: MUTED }}>
                  {h.age}歳・{h.jockey}・{h.sire}
                  {h.trainer ? `・${h.trainer}厩舎` : ""}
                </div>
                {h.past && h.past.length > 0 && (
                  <div className="text-[0.625rem] mt-0.5 flex items-center gap-1" style={{ color: MUTED }}>
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
                  <p className="text-[0.625rem] mt-0.5 italic" style={{ color: MUTED }}>
                    「{h.note.comment}」
                  </p>
                )}
              </div>
              <div className="text-right">
                <div
                  className="text-xl font-black tabular-nums"
                  style={{ color: idx === 0 && !noDifferentiation ? RED : INK, fontFamily: "'Shippori Mincho', serif" }}
                >
                  {h.total}
                </div>
                <div className="text-[0.5625rem]" style={{ color: MUTED }}>
                  {h.hasPastData ? `基礎${h.base}` : "基礎データなし"}
                </div>
              </div>
            </div>

            {(!h.hasPastData || h.applied.length > 0) && (
              <div className="flex items-start gap-2.5">
                <div className="w-6 shrink-0" aria-hidden="true" />
                <div style={{ width: 28 }} className="shrink-0" aria-hidden="true" />
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {!h.hasPastData && (
                    <span
                      className="text-[0.625rem] px-1.5 py-0.5 font-semibold"
                      style={{ border: `1px dashed ${MUTED}`, color: MUTED }}
                    >
                      評価データなし・他の補正のみ反映
                    </span>
                  )}
                  {h.applied.map((a, i) => (
                    <span
                      key={i}
                      className="text-[0.625rem] px-1.5 py-0.5 font-semibold"
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
              </div>
            )}

            {userId && (
              <div className="flex items-center gap-2.5 mt-1.5">
                <div className="w-6 shrink-0" aria-hidden="true" />
                <div style={{ width: 28 }} className="shrink-0" aria-hidden="true" />
                <div className="flex items-center gap-1.5 flex-1">
                  {PADDOCK_GRADES.map((g) => (
                    <button
                      key={g}
                      onClick={() => handlePaddockGrade(h.num, h.paddockGrade === g ? null : g)}
                      className="max-w-16 py-1 px-2.5 text-[0.625rem] font-bold"
                      style={{
                        background: h.paddockGrade === g ? INK : "transparent",
                        color: h.paddockGrade === g ? PAPER_CARD : INK,
                        border: `1px solid ${INK}`,
                      }}
                    >
                      {g}
                    </button>
                  ))}
                  <span className="text-[0.625rem] shrink-0" style={{ color: MUTED }}>
                    パドック
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
