import { useState } from "react";
import { Plus, X, Sparkles, Flag, BookMarked, Wand2 } from "lucide-react";
import { ATTR_TYPES, TREND_TYPES } from "../data/ruleOptions";
import { PAPER, PAPER_CARD, INK, RED, MUTED, LINE } from "../lib/colors";
import FreeTextRuleForm from "./FreeTextRuleForm";

export default function RuleForm({
  races,
  attrRules,
  trendRules,
  onAddAttrRule,
  onDeleteAttrRule,
  onAddTrendRule,
  onDeleteTrendRule,
  saveState,
  locked = false,
}) {
  const [tab, setTab] = useState("attr");
  const [attrType, setAttrType] = useState(ATTR_TYPES[0]);
  const [attrValue, setAttrValue] = useState("");
  const [attrScore, setAttrScore] = useState(2);

  const [trendRace, setTrendRace] = useState(races[0]?.name ?? "");
  const [trendType, setTrendType] = useState(TREND_TYPES[0]);
  const [trendValue, setTrendValue] = useState("");
  const [trendScore, setTrendScore] = useState(-3);
  const [trendLabel, setTrendLabel] = useState("");
  const [lockedNotice, setLockedNotice] = useState(false);

  const addAttr = () => {
    if (!attrValue.trim()) return;
    onAddAttrRule({ type: attrType, value: attrValue.trim(), score: Number(attrScore) });
    if (locked) {
      setLockedNotice(true);
    } else {
      setAttrValue("");
    }
  };

  const addTrend = () => {
    if (!trendValue.trim() || !trendLabel.trim()) return;
    onAddTrendRule({
      race: trendRace,
      type: trendType,
      value: trendValue.trim(),
      score: Number(trendScore),
      label: trendLabel.trim(),
    });
    if (locked) {
      setLockedNotice(true);
    } else {
      setTrendValue("");
      setTrendLabel("");
    }
  };

  const inputStyle = { background: PAPER, border: `1px solid ${INK}`, color: INK };

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold" style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}>
          知見の登録
        </h2>
        <span className="text-[10px]" style={{ color: saveState === "error" ? RED : MUTED }}>
          {saveState === "saving" && "保存中…"}
          {saveState === "saved" && "保存済み"}
          {saveState === "error" && "保存に失敗しました"}
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: MUTED }}>
        あなただけの予想ルールを貯めていこう。入力内容はあなたのアカウントに自動保存されます
      </p>

      <div className="flex gap-2 mb-4">
        {[
          { key: "attr", label: "属性ルール", icon: Sparkles },
          { key: "trend", label: "傾向ルール", icon: Flag },
          { key: "free", label: "自由入力", icon: Wand2 },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 font-semibold text-sm"
            style={{
              background: tab === t.key ? INK : "transparent",
              color: tab === t.key ? PAPER : INK,
              border: `1px solid ${INK}`,
              fontFamily: "'Shippori Mincho', serif",
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "free" && (
        <FreeTextRuleForm
          races={races}
          onAddAttrRule={onAddAttrRule}
          onAddTrendRule={onAddTrendRule}
          locked={locked}
          onLockedAttempt={() => setLockedNotice(true)}
        />
      )}

      {tab === "attr" && (
        <div className="p-4 mb-4" style={{ background: PAPER_CARD, border: `1px solid ${INK}` }}>
          <div className="text-xs font-semibold mb-3" style={{ color: MUTED }}>
            馬・血統・騎手などに紐づく評価
          </div>
          <div className="flex gap-2 mb-3">
            {ATTR_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setAttrType(t)}
                className="px-3 py-1 text-xs font-semibold"
                style={{
                  background: attrType === t ? RED : "transparent",
                  color: attrType === t ? PAPER : INK,
                  border: `1px solid ${attrType === t ? RED : INK}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={attrValue}
            onChange={(e) => setAttrValue(e.target.value)}
            placeholder={`${attrType}名を入力(例:キズナ)`}
            className="w-full px-3 py-2 text-sm mb-3 outline-none"
            style={inputStyle}
          />
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold" style={{ color: MUTED }}>
              評価点
            </span>
            <input
              type="range"
              min={-10}
              max={10}
              value={attrScore}
              onChange={(e) => setAttrScore(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm font-bold w-10 text-right" style={{ color: RED }}>
              {attrScore > 0 ? "+" : ""}
              {attrScore}
            </span>
          </div>
          <button
            onClick={addAttr}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 font-bold text-sm"
            style={{ background: INK, color: PAPER, fontFamily: "'Shippori Mincho', serif" }}
          >
            <Plus size={16} /> ルールを追加
          </button>
        </div>
      )}

      {tab === "trend" && (
        <div className="p-4 mb-4" style={{ background: PAPER_CARD, border: `1px solid ${INK}` }}>
          <div className="text-xs font-semibold mb-3" style={{ color: MUTED }}>
            特定レースの傾向・法則
          </div>
          <select
            value={trendRace}
            onChange={(e) => setTrendRace(e.target.value)}
            className="w-full px-3 py-2 text-sm mb-3 outline-none"
            style={inputStyle}
          >
            {races.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2 mb-3">
            {TREND_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTrendType(t)}
                className="px-3 py-1 text-xs font-semibold"
                style={{
                  background: trendType === t ? RED : "transparent",
                  color: trendType === t ? PAPER : INK,
                  border: `1px solid ${trendType === t ? RED : INK}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={trendValue}
            onChange={(e) => setTrendValue(e.target.value)}
            placeholder="条件値(例:3歳 / 8枠以降)"
            className="w-full px-3 py-2 text-sm mb-3 outline-none"
            style={inputStyle}
          />
          <input
            value={trendLabel}
            onChange={(e) => setTrendLabel(e.target.value)}
            placeholder="メモ(例:3歳馬は来ない)"
            className="w-full px-3 py-2 text-sm mb-3 outline-none"
            style={inputStyle}
          />
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold" style={{ color: MUTED }}>
              評価点
            </span>
            <input
              type="range"
              min={-10}
              max={10}
              value={trendScore}
              onChange={(e) => setTrendScore(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm font-bold w-10 text-right" style={{ color: RED }}>
              {trendScore > 0 ? "+" : ""}
              {trendScore}
            </span>
          </div>
          <button
            onClick={addTrend}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 font-bold text-sm"
            style={{ background: INK, color: PAPER, fontFamily: "'Shippori Mincho', serif" }}
          >
            <Plus size={16} /> ルールを追加
          </button>
        </div>
      )}

      {locked && lockedNotice && (
        <p
          className="text-sm font-bold text-center mb-4 py-2.5 px-3"
          style={{ color: RED, background: PAPER_CARD, border: `1px solid ${RED}` }}
        >
          保存するには会員登録(ログイン)が必要です。この下から登録・ログインしてください
        </p>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: INK }}>
          <BookMarked size={14} /> 登録済みルール({attrRules.length + trendRules.length})
        </h3>
        <div style={{ border: `1px solid ${INK}` }}>
          {[...attrRules, ...trendRules].map((r, i, arr) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-3 py-2"
              style={{
                background: PAPER_CARD,
                borderBottom: i < arr.length - 1 ? `1px solid ${LINE}` : "none",
              }}
            >
              <div className="text-xs">
                <span className="font-semibold px-1.5 py-0.5 mr-1.5" style={{ border: `1px solid ${INK}`, color: INK }}>
                  {r.type ? r.type : r.race}
                </span>
                <span style={{ color: INK }}>{r.race ? r.label : r.value}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: r.score >= 0 ? INK : RED }}>
                  {r.score > 0 ? "+" : ""}
                  {r.score}
                </span>
                <button
                  onClick={() => (r.race ? onDeleteTrendRule(r.id) : onDeleteAttrRule(r.id))}
                >
                  <X size={13} color={MUTED} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
