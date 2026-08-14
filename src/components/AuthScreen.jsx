import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PAPER, PAPER_CARD, INK, RED, MUTED } from "../lib/colors";

export default function AuthScreen() {
  const [mode, setMode] = useState("signIn"); // signIn | signUp | forgotPassword
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error | signedUp | resetSent
  const [errorMessage, setErrorMessage] = useState("");

  const inputStyle = { background: PAPER, border: `1px solid ${INK}`, color: INK };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    if (mode === "forgotPassword") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }
      setStatus("resetSent");
      return;
    }

    const { error } =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus(mode === "signUp" ? "signedUp" : "idle");
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setStatus("idle");
    setErrorMessage("");
  };

  return (
    <div className="px-4 pt-4 pb-24">
      <p className="text-xs text-center mb-4" style={{ color: MUTED }}>
        知見の登録・保存にはログインが必要です
      </p>

      <div className="p-5" style={{ background: PAPER_CARD, border: `1px solid ${INK}` }}>
        {mode !== "forgotPassword" && (
          <div className="flex gap-2 mb-4">
            {[
              { key: "signIn", label: "ログイン" },
              { key: "signUp", label: "新規登録" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => switchMode(t.key)}
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
        )}

        {status === "signedUp" ? (
          <p className="text-sm" style={{ color: INK }}>
            確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。
          </p>
        ) : status === "resetSent" ? (
          <p className="text-sm" style={{ color: INK }}>
            パスワード再設定用のメールを送信しました。メール内のリンクから新しいパスワードを設定してください。
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            {mode === "forgotPassword" && (
              <p className="text-xs mb-3" style={{ color: MUTED }}>
                登録済みのメールアドレスに、パスワード再設定用のリンクを送信します
              </p>
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="メールアドレス"
              className="w-full px-3 py-2 text-sm mb-3 outline-none"
              style={inputStyle}
            />
            {mode !== "forgotPassword" && (
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
            )}
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
              {status === "loading"
                ? "処理中…"
                : mode === "signIn"
                ? "ログイン"
                : mode === "signUp"
                ? "アカウント作成"
                : "再設定メールを送信"}
            </button>

            {mode === "signIn" && (
              <button
                type="button"
                onClick={() => switchMode("forgotPassword")}
                className="w-full text-xs mt-3 underline"
                style={{ color: MUTED }}
              >
                パスワードをお忘れですか?
              </button>
            )}
            {mode === "forgotPassword" && (
              <button
                type="button"
                onClick={() => switchMode("signIn")}
                className="w-full text-xs mt-3 underline"
                style={{ color: MUTED }}
              >
                ログイン画面に戻る
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
