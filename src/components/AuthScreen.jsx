import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PAPER, PAPER_CARD, INK, RED, MUTED } from "../lib/colors";

export default function AuthScreen() {
  const [mode, setMode] = useState("signIn"); // signIn | signUp
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error | signedUp
  const [errorMessage, setErrorMessage] = useState("");

  const inputStyle = { background: PAPER, border: `1px solid ${INK}`, color: INK };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    const { error } =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    if (mode === "signUp") {
      setStatus("signedUp");
    } else {
      setStatus("idle");
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col justify-center px-6" style={{ background: PAPER }}>
      <h1
        className="text-3xl font-black text-center mb-1"
        style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}
      >
        じぶん競馬新聞
      </h1>
      <p className="text-xs text-center mb-8" style={{ color: MUTED }}>
        あなただけの知見を保存するにはログインしてください
      </p>

      <div className="p-5" style={{ background: PAPER_CARD, border: `1px solid ${INK}` }}>
        <div className="flex gap-2 mb-4">
          {[
            { key: "signIn", label: "ログイン" },
            { key: "signUp", label: "新規登録" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setMode(t.key);
                setStatus("idle");
                setErrorMessage("");
              }}
              className="flex-1 py-2 font-semibold text-sm"
              style={{
                background: mode === t.key ? INK : "transparent",
                color: mode === t.key ? PAPER : INK,
                border: `1px solid ${INK}`,
                fontFamily: "'Shippori Mincho', serif",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {status === "signedUp" ? (
          <p className="text-sm" style={{ color: INK }}>
            確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="メールアドレス"
              className="w-full px-3 py-2 text-sm mb-3 outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワード(6文字以上)"
              className="w-full px-3 py-2 text-sm mb-3 outline-none"
              style={inputStyle}
            />
            {status === "error" && (
              <p className="text-xs mb-3" style={{ color: RED }}>
                {errorMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full py-2.5 font-bold text-sm"
              style={{ background: INK, color: PAPER, fontFamily: "'Shippori Mincho', serif" }}
            >
              {status === "loading" ? "処理中…" : mode === "signIn" ? "ログイン" : "アカウント作成"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
