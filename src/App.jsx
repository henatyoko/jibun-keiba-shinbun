import { useEffect, useState } from "react";
import { Flag, Sparkles } from "lucide-react";
import Masthead from "./components/Masthead";
import RaceList from "./components/RaceList";
import RaceDetail from "./components/RaceDetail";
import RuleForm from "./components/RuleForm";
import { fetchRaces } from "./data/raceSource";
import { INITIAL_ATTR_RULES, INITIAL_TREND_RULES } from "./data/mockRules";
import { getItem, setItem } from "./lib/storage";
import { PAPER, INK } from "./lib/colors";

const RULES_STORAGE_KEY = "jibun-keiba-shinbun:chiken-rules";

export default function App() {
  const [tab, setTab] = useState("race");
  const [races, setRaces] = useState([]);
  const [selectedRace, setSelectedRace] = useState(null);
  const [attrRules, setAttrRules] = useState(INITIAL_ATTR_RULES);
  const [trendRules, setTrendRules] = useState(INITIAL_TREND_RULES);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error

  // レース一覧を取得する
  useEffect(() => {
    fetchRaces().then(setRaces);
  }, []);

  // 起動時に保存済みの知見データを読み込む
  useEffect(() => {
    (async () => {
      const saved = await getItem(RULES_STORAGE_KEY);
      if (saved) {
        if (saved.attrRules) setAttrRules(saved.attrRules);
        if (saved.trendRules) setTrendRules(saved.trendRules);
      }
      setLoaded(true);
    })();
  }, []);

  // 知見データが変わるたびに保存する(初回読み込み完了後のみ)
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      setSaveState("saving");
      const ok = await setItem(RULES_STORAGE_KEY, { attrRules, trendRules });
      setSaveState(ok ? "saved" : "error");
    })();
  }, [attrRules, trendRules, loaded]);

  return (
    <div className="min-h-screen max-w-md mx-auto relative" style={{ background: PAPER, fontFamily: "'Zen Old Mincho','Shippori Mincho',serif" }}>
      <Masthead raceCount={races.length} />

      {tab === "race" &&
        (selectedRace ? (
          <RaceDetail race={selectedRace} attrRules={attrRules} trendRules={trendRules} onBack={() => setSelectedRace(null)} />
        ) : (
          <RaceList races={races} onSelect={setSelectedRace} />
        ))}
      {tab === "rules" && (
        <RuleForm
          races={races}
          attrRules={attrRules}
          setAttrRules={setAttrRules}
          trendRules={trendRules}
          setTrendRules={setTrendRules}
          saveState={saveState}
        />
      )}

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto flex" style={{ background: INK, borderTop: `2px solid ${PAPER}` }}>
        {[
          { key: "race", label: "レース", icon: Flag },
          { key: "rules", label: "知見登録", icon: Sparkles },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setSelectedRace(null);
            }}
            className="flex-1 flex flex-col items-center gap-0.5 py-2.5"
          >
            <t.icon size={18} color={tab === t.key ? "#E8B4A8" : PAPER} style={{ opacity: tab === t.key ? 1 : 0.6 }} />
            <span
              className="text-[10px] font-semibold"
              style={{ color: tab === t.key ? "#E8B4A8" : PAPER, opacity: tab === t.key ? 1 : 0.6, fontFamily: "'Shippori Mincho', serif" }}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
