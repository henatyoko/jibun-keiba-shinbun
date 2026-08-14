import { useEffect, useState } from "react";
import { Flag, Sparkles } from "lucide-react";
import Masthead from "./components/Masthead";
import RaceList from "./components/RaceList";
import RaceDetail from "./components/RaceDetail";
import RuleForm from "./components/RuleForm";
import AuthScreen from "./components/AuthScreen";
import { fetchRaces } from "./data/raceSource";
import {
  fetchRules,
  insertAttrRule,
  deleteAttrRule,
  insertTrendRule,
  deleteTrendRule,
} from "./lib/rulesRepository";
import { supabase, isSupabaseConfigured } from "./lib/supabaseClient";
import { PAPER, INK } from "./lib/colors";

export default function App() {
  const [tab, setTab] = useState("race");
  const [races, setRaces] = useState([]);
  const [selectedRace, setSelectedRace] = useState(null);
  const [attrRules, setAttrRules] = useState([]);
  const [trendRules, setTrendRules] = useState([]);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);

  // ログイン状態を監視する
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // レース一覧を取得する
  useEffect(() => {
    fetchRaces().then(setRaces);
  }, []);

  // ログイン中ユーザーの知見ルールを読み込む
  useEffect(() => {
    if (!session?.user) return;
    fetchRules(session.user.id).then(({ attrRules, trendRules }) => {
      setAttrRules(attrRules);
      setTrendRules(trendRules);
    });
  }, [session?.user?.id]);

  const handleAddAttrRule = async (rule) => {
    setSaveState("saving");
    try {
      const saved = await insertAttrRule(session.user.id, rule);
      setAttrRules((prev) => [...prev, saved]);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
    }
  };

  const handleDeleteAttrRule = async (id) => {
    setSaveState("saving");
    try {
      await deleteAttrRule(id);
      setAttrRules((prev) => prev.filter((r) => r.id !== id));
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
    }
  };

  const handleAddTrendRule = async (rule) => {
    setSaveState("saving");
    try {
      const saved = await insertTrendRule(session.user.id, rule);
      setTrendRules((prev) => [...prev, saved]);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
    }
  };

  const handleDeleteTrendRule = async (id) => {
    setSaveState("saving");
    try {
      await deleteTrendRule(id);
      setTrendRules((prev) => prev.filter((r) => r.id !== id));
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
    }
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAPER, color: INK }}>
        読み込み中…
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen max-w-md mx-auto relative" style={{ background: PAPER, fontFamily: "'Zen Old Mincho','Shippori Mincho',serif" }}>
      <Masthead
        raceCount={races.length}
        userEmail={session?.user?.email}
        onLogout={() => supabase.auth.signOut()}
      />

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
          trendRules={trendRules}
          onAddAttrRule={handleAddAttrRule}
          onDeleteAttrRule={handleDeleteAttrRule}
          onAddTrendRule={handleAddTrendRule}
          onDeleteTrendRule={handleDeleteTrendRule}
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
