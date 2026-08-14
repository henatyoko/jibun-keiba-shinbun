import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { PAPER, PAPER_CARD, INK, RED, MUTED } from "../lib/colors";

export default function ResetPasswordForm({ onDone }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error | done
  const [errorMessage, setErrorMessage] = useState("");

  const inputStyle = { background: PAPER, border: `1px solid ${INK}`, color: INK };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("done");
  };

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col justify-center px-6" style={{ background: PAPER }}>
      <h1 className="text-2xl font-black text-center mb-1" style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}>
        新しいパスワードの設定
      </h1>
      <p className="text-xs text-center mb-8" style={{ color: MUTED }}>
        新しいパスワードを入力してください
      </p>

      <div className="p-5" style={{ background: PAPER_CARD, border: `1px solid ${INK}` }}>
        {status === "done" ? (
          <>
            <p className="text-sm mb-4" style={{ color: INK }}>
              パスワードを更新しました。
            </p>
            <button
              onClick={onDone}
              className="w-full py-2.5 font-bold text-sm"
              style={{ background: INK, color: PAPER, fontFamily: "'Shippori Mincho', serif" }}
            >
              アプリに戻る
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="新しいパスワード(6文字以上)"
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
              {status === "loading" ? "処理中…" : "パスワードを更新"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
