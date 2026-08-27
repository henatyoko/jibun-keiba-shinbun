import { useEffect, useRef, useState } from "react";
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from "react-router-dom";
import { Flag, Sparkles, History } from "lucide-react";
import Masthead from "./components/Masthead";
import RaceList from "./components/RaceList";
import RaceDetail from "./components/RaceDetail";
import RuleForm from "./components/RuleForm";
import AuthScreen from "./components/AuthScreen";
import ResetPasswordForm from "./components/ResetPasswordForm";
import PastMeetingList from "./components/PastMeetingList";
import { fetchRaces, fetchRacesByDate, fetchRaceWithSiblings } from "./data/raceSource";
import {
  fetchRules,
  insertAttrRule,
  deleteAttrRule,
  insertTrendRule,
  deleteTrendRule,
} from "./lib/rulesRepository";
import { supabase, isSupabaseConfigured } from "./lib/supabaseClient";
import { PAPER, INK, MINT } from "./lib/colors";

// レース一覧の初回表示を速くするため、前回取得した内容をlocalStorageに残しておき、
// 次回起動時はまずそれを即表示しつつ裏で最新データに取り直す(stale-while-revalidate)。
const RACES_CACHE_KEY = "jks_races_cache_v1";

function loadCachedRaces() {
  try {
    const raw = localStorage.getItem(RACES_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCachedRaces(races) {
  try {
    localStorage.setItem(RACES_CACHE_KEY, JSON.stringify(races));
  } catch {
    // 容量超過・プライベートモード等は無視してよい
  }
}

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[5] flex flex-col items-center justify-center gap-2" style={{ background: "rgba(241, 233, 216, 0.9)" }}>
      <div className="horse-run-track">
        <span>🐎</span>
      </div>
      <p className="text-xs" style={{ color: INK }}>
        レース情報を取得中…
      </p>
    </div>
  );
}

// 開催日ページ(/history/:day)。過去レース一覧から選んだ1日分のレースを取得して表示する。
function HistoryDayRoute({ attrRules, trendRules }) {
  const { day } = useParams();
  const navigate = useNavigate();
  const [races, setRaces] = useState(null);

  useEffect(() => {
    setRaces(null);
    fetchRacesByDate(day).then(setRaces);
  }, [day]);

  if (races === null) return <LoadingOverlay />;
  return (
    <RaceList
      races={races}
      attrRules={attrRules}
      trendRules={trendRules}
      showFallbackNotice={false}
      onSelect={(r) => navigate(`/races/${r.id}`)}
    />
  );
}

// レース詳細ページ(/races/:raceId)。App側で保持している直近分に無ければ、
// race_codeの日付からその日のレース一式を取得するフォールバックを行う
// (過去レース一覧から辿った古いレースもこの同じルートで開けるようにするため)。
function RaceDetailRoute({ races, racesLoading, attrRules, trendRules, userId }) {
  const { raceId } = useParams();
  const navigate = useNavigate();
  const [fallback, setFallback] = useState({ status: "idle", race: null, siblings: [] });

  const raceInMain = races.find((r) => r.id === raceId);

  useEffect(() => {
    if (raceInMain || racesLoading) return;
    let cancelled = false;
    setFallback({ status: "loading", race: null, siblings: [] });
    fetchRaceWithSiblings(raceId).then(({ race, siblings }) => {
      if (cancelled) return;
      setFallback({ status: "done", race, siblings });
    });
    return () => {
      cancelled = true;
    };
  }, [raceId, raceInMain, racesLoading]);

  if (raceInMain) {
    return (
      <RaceDetail
        race={raceInMain}
        races={races}
        attrRules={attrRules}
        trendRules={trendRules}
        userId={userId}
        onBack={() => navigate("/")}
        onNavigate={(r) => navigate(`/races/${r.id}`)}
      />
    );
  }

  if (racesLoading || fallback.status === "idle" || fallback.status === "loading") {
    return <LoadingOverlay />;
  }

  if (!fallback.race) {
    return <Navigate to="/" replace />;
  }

  return (
    <RaceDetail
      race={fallback.race}
      races={fallback.siblings}
      attrRules={attrRules}
      trendRules={trendRules}
      userId={userId}
      onBack={() => navigate(`/history/${raceId.slice(0, 8)}`)}
      onNavigate={(r) => navigate(`/races/${r.id}`)}
    />
  );
}

export default function App() {
  const [races, setRaces] = useState(() => loadCachedRaces() ?? []);
  const [racesLoading, setRacesLoading] = useState(() => loadCachedRaces() === null);
  const [attrRules, setAttrRules] = useState([]);
  const [trendRules, setTrendRules] = useState([]);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const authScreenRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // 未ログインで知見を保存しようとした時、ログイン欄までスクロールして知らせる
  const requireLogin = () => {
    authScreenRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
    fetchRaces().then((r) => {
      setRaces(r);
      setRacesLoading(false);
      if (isSupabaseConfigured && r.length > 0) saveCachedRaces(r);
    });
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

  const activeTab = location.pathname.startsWith("/rules")
    ? "rules"
    : location.pathname.startsWith("/history")
      ? "history"
      : "race";

  return (
    <div className="min-h-screen relative" style={{ background: PAPER, fontFamily: "'Zen Old Mincho','Shippori Mincho',serif" }}>
      <Masthead
        raceCount={races.length}
        userEmail={session?.user?.email}
        onLogout={() => supabase.auth.signOut()}
      />

      <div className="max-w-md mx-auto relative pb-16" style={{ background: PAPER, minHeight: "100vh" }}>
        <Routes>
          <Route
            path="/"
            element={
              racesLoading ? (
                <div className="fixed inset-0 z-[5] flex flex-col items-center justify-center gap-2" style={{ background: "rgba(241, 233, 216, 0.9)" }}>
                  <div className="horse-run-track">
                    <span>🐎</span>
                  </div>
                  <p className="text-xs" style={{ color: INK }}>
                    レース情報を取得中…
                  </p>
                </div>
              ) : (
                <RaceList races={races} attrRules={attrRules} trendRules={trendRules} onSelect={(r) => navigate(`/races/${r.id}`)} />
              )
            }
          />
          <Route
            path="/races/:raceId"
            element={
              <RaceDetailRoute
                races={races}
                racesLoading={racesLoading}
                attrRules={attrRules}
                trendRules={trendRules}
                userId={session?.user?.id}
              />
            }
          />
          <Route path="/history" element={<PastMeetingList />} />
          <Route
            path="/history/:day"
            element={<HistoryDayRoute attrRules={attrRules} trendRules={trendRules} />}
          />
          <Route
            path="/rules"
            element={
              <>
                <RuleForm
                  races={races}
                  attrRules={session ? attrRules : []}
                  trendRules={session ? trendRules : []}
                  locked={!session}
                  onAddAttrRule={session ? handleAddAttrRule : requireLogin}
                  onDeleteAttrRule={session ? handleDeleteAttrRule : requireLogin}
                  onAddTrendRule={session ? handleAddTrendRule : requireLogin}
                  onDeleteTrendRule={session ? handleDeleteTrendRule : requireLogin}
                  saveState={session ? saveState : "idle"}
                />
                {!session && (
                  <div ref={authScreenRef}>
                    <AuthScreen />
                  </div>
                )}
              </>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20" style={{ background: MINT, borderTop: `2px solid ${INK}` }}>
        <div className="max-w-md mx-auto flex">
          {[
            { key: "race", label: "レース", icon: Flag, path: "/" },
            { key: "history", label: "過去レース", icon: History, path: "/history" },
            { key: "rules", label: "知見登録", icon: Sparkles, path: "/rules" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => navigate(t.path)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2"
            >
              <div
                className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-full"
                style={{ background: activeTab === t.key ? PAPER : "transparent" }}
              >
                <t.icon size={18} color={INK} style={{ opacity: activeTab === t.key ? 1 : 0.55 }} />
                <span
                  className="text-[0.625rem] font-semibold"
                  style={{ color: INK, opacity: activeTab === t.key ? 1 : 0.55, fontFamily: "'Shippori Mincho', serif" }}
                >
                  {t.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
