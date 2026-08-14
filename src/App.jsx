import { useEffect, useState } from "react";
import { Flag, Sparkles } from "lucide-react";
import Masthead from "./components/Masthead";
import RaceList from "./components/RaceList";
import RaceDetail from "./components/RaceDetail";
import RuleForm from "./components/RuleForm";
import AuthScreen from "./components/AuthScreen";
import ResetPasswordForm from "./components/ResetPasswordForm";
import { fetchRaces } from "./data/raceSource";
import {
  fetchRules,
  insertAttrRule,
  deleteAttrRule,
  insertTrendRule,
  deleteTrendRule,
} from "./lib/rulesRepository";
import { supabase, isSupabaseConfigured } from "./lib/supabaseClient";
import { PAPER, INK, GUTTER } from "./lib/colors";
import horseJockeyImg from "./assets/horse-jockey.png";

export default function App() {
  const [tab, setTab] = useState("race");
  const [races, setRaces] = useState([]);
  const [selectedRace, setSelectedRace] = useState(null);
  const [attrRules, setAttrRules] = useState([]);
  const [trendRules, setTrendRules] = useState([]);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // ログイン状態を監視する
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
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

  if (passwordRecovery) {
    return <ResetPasswordForm onDone={() => setPasswordRecovery(false)} />;
  }

  return (
    <div className="min-h-screen relative" style={{ background: GUTTER, fontFamily: "'Zen Old Mincho','Shippori Mincho',serif" }}>
      {/* PC表示時、中央カラムの外側の暗い余白にうっすら見える馬柄パターン */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          maskImage: `url(${horseJockeyImg})`,
          WebkitMaskImage: `url(${horseJockeyImg})`,
          maskRepeat: "space",
          WebkitMaskRepeat: "space",
          maskSize: "150px 126px",
          WebkitMaskSize: "150px 126px",
          backgroundColor: PAPER,
          opacity: 0.16,
        }}
      />

      <Masthead
        raceCount={races.length}
        userEmail={session?.user?.email}
        onLogout={() => supabase.auth.signOut()}
      />

      <div
        className="max-w-md mx-auto relative pb-16"
        style={{ background: PAPER, borderLeft: `1px solid ${PAPER}`, borderRight: `1px solid ${PAPER}`, minHeight: "100vh" }}
      >
        {tab === "race" &&
          (selectedRace ? (
            <RaceDetail race={selectedRace} attrRules={attrRules} trendRules={trendRules} onBack={() => setSelectedRace(null)} />
          ) : (
            <RaceList races={races} onSelect={setSelectedRace} />
          ))}
        {tab === "rules" &&
          (session ? (
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
          ) : (
            <AuthScreen />
          ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0" style={{ background: INK, borderTop: `2px solid ${PAPER}` }}>
        <div className="max-w-md mx-auto flex">
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
    </div>
  );
}
