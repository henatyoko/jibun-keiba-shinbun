import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Share2 } from "lucide-react";
import GradeChip from "./GradeChip";
import WakuBadge from "./WakuBadge";
import {
  scoreHorse,
  baseScoreFromPastRaces,
  courseBiasAdjustment,
  distanceAptitudeAdjustment,
  hasOwnDistanceData,
  pedigreeAptitudeAdjustment,
  handicapWeightAdjustment,
  trainingAdjustment,
  paddockAdjustment,
  computeMarks,
  suggestBettingPattern,
} from "../lib/scoring";
import { fetchJvPastRaces } from "../lib/jvHorseHistoryRepository";
import { fetchAiNotes } from "../lib/aiNotesRepository";
import { fetchRacePayouts } from "../lib/payoutRepository";
import { fetchPedigreeAptitude } from "../lib/pedigreeAptitudeRepository";
import { fetchRecentTrainingWorks } from "../lib/trainingRepository";
import { fetchPaddockGrades, setPaddockGrade as savePaddockGrade } from "../lib/paddockRepository";
import { fetchSnapshot, saveSnapshotIfMissing } from "../lib/raceSnapshotRepository";
import { PAPER_CARD, INK, RED, MUTED, LINE, MARKS } from "../lib/colors";

const PADDOCK_GRADES = ["A", "B", "無印"];

export default function RaceDetail({ race, races, attrRules, trendRules, userId, onBack, onNavigate }) {
  const [jvPastByHorse, setJvPastByHorse] = useState({});
  const [notesByHorse, setNotesByHorse] = useState({});
  const [paddockByNum, setPaddockByNum] = useState({});
  const [winPayout, setWinPayout] = useState(null);
  const [pedigreeStatsById, setPedigreeStatsById] = useState({});
  const [trainingByHorse, setTrainingByHorse] = useState({});
  const [snapshot, setSnapshot] = useState(null);
  const [loadingPast, setLoadingPast] = useState(true);
  const [sortMode, setSortMode] = useState("score"); // score | waku
  const [shareCopied, setShareCopied] = useState(false);

  // レースが切り替わった時、前のレースでのスクロール位置や並び順を引き継がない
  useEffect(() => {
    window.scrollTo(0, 0);
    setSortMode("score");
  }, [race.id]);

  // 同じ開催日・同じ競馬場のレースをレース番号順に並べ、プルダウン移動に使う。
  const siblingRaces = useMemo(() => {
    if (!races) return [];
    return races
      .filter((r) => r.place === race.place && r.rawDate === race.rawDate)
      .sort((a, b) => (a.raceNumber ?? 0) - (b.raceNumber ?? 0));
  }, [races, race]);

  // ロジック変更をしても過去レースの印・評価が遡って変わらないよう、結果確定済みのレースは
  // まずスナップショット(最初に計算された時点の固定結果)を探し、あればそれをそのまま使って
  // 重い再取得・再計算(過去走/調教/血統/AI生成)を丸ごと省略する。無ければ従来通り計算する。
  useEffect(() => {
    setLoadingPast(true);
    setSnapshot(null);
    let cancelled = false;

    async function load() {
      if (race.isPastReview) {
        const snap = await fetchSnapshot(race.id);
        if (cancelled) return;
        if (snap) {
          setSnapshot(snap);
          setLoadingPast(false);
          return;
        }
      }

      const horseIds = race.horses.map((h) => h.horseId).filter(Boolean);
      const [jvPast, pedigree, training] = await Promise.all([
        fetchJvPastRaces(horseIds, race.id),
        fetchPedigreeAptitude(race.horses),
        fetchRecentTrainingWorks(horseIds, race.rawDate),
      ]);
      if (cancelled) return;
      setJvPastByHorse(jvPast);
      setPedigreeStatsById(pedigree);
      setTrainingByHorse(training);
      const notes = await fetchAiNotes(race.horses, jvPast);
      if (cancelled) return;
      setNotesByHorse(notes);
      setLoadingPast(false);
    }
    load();

    if (race.isPastReview) {
      fetchRacePayouts(race.id).then(({ win }) => {
        if (!cancelled) setWinPayout(win);
      });
    } else {
      setWinPayout(null);
    }

    return () => {
      cancelled = true;
    };
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

  // 印などの順位はスコア順に固定し、表示順(スコア順/枠順)とは切り離す
  const scored = useMemo(() => {
    // スナップショットがあれば、そこに固定された評価をそのまま使う(再計算しない)
    if (snapshot) {
      const base = race.horses.map((h) => {
        const snap = snapshot[h.num];
        if (!snap) {
          return { ...h, base: h.base, hasPastData: false, total: h.base, bonus: 0, applied: [], past: [], note: null, _snapshotMark: null };
        }
        return {
          ...h,
          base: snap.base ?? h.base,
          past: snap.pastResults,
          note: snap.aiNote,
          hasPastData: snap.hasPastData,
          total: snap.total,
          bonus: snap.total - (snap.base ?? h.base),
          applied: snap.applied,
          _snapshotMark: snap.mark,
        };
      });
      const byScore = [...base].sort((a, b) => b.total - a.total);
      const rankByHorseId = new Map(byScore.map((h, idx) => [h.horseId, idx]));
      return base.map((h) => ({ ...h, rank: rankByHorseId.get(h.horseId) }));
    }

    const futanJuryoList = race.horses.map((h) => h.futanJuryo).filter((v) => Number.isFinite(v));
    const fieldAvgFutanJuryo =
      futanJuryoList.length > 0 ? futanJuryoList.reduce((sum, v) => sum + v, 0) / futanJuryoList.length : null;
    const base = race.horses
      .map((h) => {
        const jvPast = jvPastByHorse[h.horseId];
        const base = jvPast ? baseScoreFromPastRaces(jvPast) : h.base;
        const note = notesByHorse[h.horseId];
        const { total, bonus, applied } = scoreHorse(
          { ...h, base },
          attrRules,
          trendRules,
          race.name
        );
        const aiAdjustment = note?.scoreAdjustment ?? 0;
        const bias = courseBiasAdjustment(h.waku, race.place, race.distance);
        // 本馬自身の距離実績が薄い(新馬戦など)時は、父・母父の産駒成績を代替シグナルにする
        const aptitude = hasOwnDistanceData(h.distanceStats, race.distance)
          ? distanceAptitudeAdjustment(h.distanceStats, race.distance)
          : pedigreeAptitudeAdjustment(pedigreeStatsById[h.sireId], pedigreeStatsById[h.damsireId], race.distance);
        const paddockGrade = paddockByNum[h.num];
        const paddock = paddockAdjustment(paddockGrade);
        const handicap = handicapWeightAdjustment(race.isHandicap, h.futanJuryo, fieldAvgFutanJuryo);
        const training = trainingAdjustment(trainingByHorse[h.horseId]);
        const extra = [
          ...(aiAdjustment !== 0 ? [{ label: "AI評価", score: aiAdjustment }] : []),
          ...(bias ? [{ label: bias.label, score: bias.score }] : []),
          ...(aptitude ? [{ label: aptitude.label, score: aptitude.score }] : []),
          ...(paddock ? [{ label: paddock.label, score: paddock.score }] : []),
          ...(handicap ? [{ label: handicap.label, score: handicap.score }] : []),
          ...(training ? [{ label: training.label, score: training.score }] : []),
        ];
        const extraTotal =
          aiAdjustment +
          (bias?.score ?? 0) +
          (aptitude?.score ?? 0) +
          (paddock?.score ?? 0) +
          (handicap?.score ?? 0) +
          (training?.score ?? 0);
        const hasPastData = Boolean(jvPast && jvPast.length > 0);
        return {
          ...h,
          base,
          past: jvPast,
          note,
          paddockGrade,
          hasPastData,
          total: total + extraTotal,
          bonus: bonus + extraTotal,
          applied: [...applied, ...extra],
        };
      });
    // 枠順抽選前の馬はumaban(num)が全馬0になるため、必ず一意なhorseIdで順位を引く
    const byScore = [...base].sort((a, b) => b.total - a.total);
    const rankByHorseId = new Map(byScore.map((h, idx) => [h.horseId, idx]));
    return base.map((h) => ({ ...h, rank: rankByHorseId.get(h.horseId) }));
  }, [race, attrRules, trendRules, jvPastByHorse, notesByHorse, paddockByNum, pedigreeStatsById, trainingByHorse, snapshot]);

  // 新馬戦などで過去データも補正も無く全馬横並びの時は、枠番順がそのまま印になって
  // 紛らわしいため印・強調表示を出さない。読み込み中も未確定の印を出さない。
  // スナップショットがある場合は、そこに固定された印をそのまま使う。
  const computedMarks = useMemo(() => {
    if (snapshot) {
      const marksByNum = {};
      scored.forEach((h) => {
        if (h._snapshotMark) marksByNum[h.num] = h._snapshotMark;
      });
      return { marksByNum, noDifferentiation: false };
    }
    return computeMarks(scored);
  }, [scored, snapshot]);
  const marksByNum = loadingPast ? {} : computedMarks.marksByNum;

  // 結果確定済み・スナップショット無し・印が計算できた時だけ、今回の計算結果を
  // 「最初の固定結果」として保存する(以降はロジックを変えてもこのレースの印は変わらない)。
  useEffect(() => {
    if (!race.isPastReview || snapshot || loadingPast || computedMarks.noDifferentiation) return;
    saveSnapshotIfMissing(race.id, scored, computedMarks.marksByNum).catch(() => {});
  }, [race.id, race.isPastReview, snapshot, loadingPast, computedMarks, scored]);

  const displayList = useMemo(() => {
    if (sortMode === "waku") {
      return [...scored].sort((a, b) => a.num - b.num);
    }
    return [...scored].sort((a, b) => a.rank - b.rank);
  }, [scored, sortMode]);

  // 振り返り表示中、実際の上位3頭を着順順に並べ、予想順位と見比べやすくする
  const top3Actual = useMemo(() => {
    if (!race.isPastReview) return [];
    return scored
      .filter((h) => h.result && h.result <= 3)
      .sort((a, b) => a.result - b.result);
  }, [scored, race.isPastReview]);

  const bettingSuggestion = useMemo(() => {
    if (loadingPast || computedMarks.noDifferentiation) return null;
    return suggestBettingPattern(scored);
  }, [scored, loadingPast, computedMarks.noDifferentiation]);

  const handleShareResult = async () => {
    const markedHorses = MARKS.map((m) => scored.find((h) => marksByNum[h.num] === m)).filter(Boolean);
    const hitCount = markedHorses.filter((h) => h.result && h.result <= 3).length;
    const text = [
      "🐴 じぶん競馬新聞",
      `${race.place}${race.raceNumber ? `${race.raceNumber}R` : ""} ${race.name}(${race.date})`,
      "",
      ...markedHorses.map((h) => `${marksByNum[h.num]} ${h.name} ${h.result ? `${h.result}着` : "着外"}`),
      "",
      `印${markedHorses.length}頭中${hitCount}頭が3位以内`,
    ].join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // ユーザーがキャンセルした場合等は何もしない
      }
      return;
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch {
        // クリップボード権限が無い場合等は何もしない
      }
    }
  };

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold active:opacity-70 transition-opacity"
          style={{ color: INK, background: PAPER_CARD, border: `1px solid ${INK}` }}
        >
          <ChevronLeft size={18} />
          レース一覧
        </button>
        <div className="flex-1" />
        {siblingRaces.length > 1 && (
          <select
            value={race.id}
            onChange={(e) => {
              const target = siblingRaces.find((r) => r.id === e.target.value);
              if (target) onNavigate(target);
            }}
            className="px-2 py-2 text-sm font-bold"
            style={{ color: INK, border: `1px solid ${INK}`, background: PAPER_CARD }}
          >
            {siblingRaces.map((r) => (
              <option key={r.id} value={r.id}>
                {r.raceNumber}R
              </option>
            ))}
          </select>
        )}
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
      {race.isPastReview && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-xs px-2 py-1" style={{ color: MUTED, border: `1px dashed ${MUTED}` }}>
            振り返り表示(このレースは終了済みです)
          </p>
          {!loadingPast && !computedMarks.noDifferentiation && (
            <button
              onClick={handleShareResult}
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold active:opacity-70 transition-opacity"
              style={{ color: INK, background: PAPER_CARD, border: `1px solid ${INK}` }}
            >
              <Share2 size={12} />
              {shareCopied ? "コピーしました" : "結果を共有"}
            </button>
          )}
        </div>
      )}
      {top3Actual.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {top3Actual.map((h) => (
            <div key={h.num} className="flex items-center gap-1.5 px-2 py-1" style={{ border: `1px solid ${INK}` }}>
              <span
                className="font-black text-sm"
                style={{ color: h.result === 1 ? RED : INK, fontFamily: "'Shippori Mincho', serif" }}
              >
                {h.result}着
              </span>
              <span className="text-xs font-bold" style={{ color: INK }}>
                {h.name}
              </span>
              {h.ninki != null && (
                <span className="text-[0.625rem]" style={{ color: MUTED }}>
                  {h.ninki}人気
                </span>
              )}
              <span className="text-xs font-bold" style={{ color: MUTED, fontFamily: "'Shippori Mincho', serif" }}>
                {marksByNum[h.num] || "無印"}
              </span>
            </div>
          ))}
        </div>
      )}
      {bettingSuggestion && (
        <div className="mb-3 px-3 py-2 text-xs" style={{ background: PAPER_CARD, border: `1px solid ${INK}`, color: INK }}>
          <span className="font-bold" style={{ fontFamily: "'Shippori Mincho', serif" }}>
            {bettingSuggestion.pattern}
          </span>
          <span className="ml-1.5">{bettingSuggestion.label}</span>
          {bettingSuggestion.detail && (
            <span className="block mt-0.5" style={{ color: MUTED }}>
              {bettingSuggestion.detail}
            </span>
          )}
        </div>
      )}
      <div className="flex gap-2 mb-3">
        {[
          { key: "score", label: "スコア順" },
          { key: "waku", label: "枠順" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setSortMode(s.key)}
            className="px-3 py-1.5 text-xs font-semibold"
            style={{
              background: sortMode === s.key ? INK : "transparent",
              color: sortMode === s.key ? PAPER_CARD : INK,
              border: `1px solid ${INK}`,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
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
              過去成績・AI評価を取得中…
            </p>
          </div>
        )}
      <div style={{ border: `1.5px solid ${INK}` }}>
        {displayList.map((h, i) => {
          const mark = marksByNum[h.num] || "";
          const isTop = mark === MARKS[0];
          return (
          <div
            key={h.num}
            className="p-2.5"
            style={{
              background: isTop ? "#F3E4C8" : PAPER_CARD,
              borderBottom: i < displayList.length - 1 ? `1px solid ${LINE}` : "none",
              minHeight: "150px",
            }}
          >
            <div className="flex items-start gap-2 mb-1.5">
              <div
                className="font-black w-6 text-center shrink-0"
                style={{ color: isTop ? RED : INK, fontFamily: "'Shippori Mincho', serif", fontSize: "20px" }}
              >
                {mark}
              </div>
              <WakuBadge num={h.num} />
              <div className="flex-1 min-w-0">
                {h.result && (
                  <div
                    className="font-black text-sm"
                    style={{ color: h.result === 1 ? RED : h.result <= 3 ? INK : MUTED, fontFamily: "'Shippori Mincho', serif" }}
                  >
                    {h.result}着
                  </div>
                )}
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
                      {h.past.map((r, i) => {
                        const finish = r.kakutei_chakujun ? Number(r.kakutei_chakujun) : null;
                        return (
                          <span
                            key={i}
                            className="font-bold"
                            style={{ color: finish === 1 ? RED : finish && finish <= 3 ? INK : MUTED }}
                          >
                            {finish ?? "?"}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                )}
                {h.note?.comment && (
                  <p className="text-[0.625rem] mt-0.5 italic" style={{ color: MUTED }}>
                    「{h.note.comment}」
                  </p>
                )}
              </div>
              <div className="text-right shrink-0 w-12">
                <div
                  className="text-xl font-black tabular-nums"
                  style={{ color: isTop ? RED : INK, fontFamily: "'Shippori Mincho', serif" }}
                >
                  {h.total}
                </div>
                <div className="text-[0.5625rem]" style={{ color: MUTED }}>
                  {h.hasPastData ? `基礎${h.base}` : "基礎データなし"}
                </div>
              </div>
            </div>

            {(h.result || h.odds != null) && (
              <div className="flex items-start gap-2 mb-1.5">
                <div className="w-6 shrink-0" aria-hidden="true" />
                <div style={{ width: 28 }} className="shrink-0" aria-hidden="true" />
                <div
                  className="text-[0.625rem] font-bold flex-1 min-w-0"
                  style={{ color: h.result === 1 ? RED : h.result && h.result <= 3 ? INK : MUTED }}
                >
                  {h.result ? "" : "オッズ:"}
                  {h.odds != null && (
                    <span className="font-normal" style={{ color: MUTED }}>
                      {" "}
                      {h.odds.toFixed(1)}倍{h.ninki ? `(${h.ninki}人気)` : ""}
                    </span>
                  )}
                  {winPayout && winPayout.num === h.num && (
                    <span className="font-normal" style={{ color: MUTED }}>
                      {" "}
                      単勝{winPayout.payout.toLocaleString()}円
                    </span>
                  )}
                </div>
              </div>
            )}

            {(!h.hasPastData || h.applied.length > 0) && (
              <div className="flex items-start gap-2">
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
              <div className="flex items-center gap-2 mt-1.5">
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
          );
        })}
      </div>
      </div>
    </div>
  );
}
