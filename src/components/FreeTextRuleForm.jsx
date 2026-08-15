import { useState } from "react";
import { Wand2, Check, RotateCcw } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { PAPER, PAPER_CARD, INK, RED, MUTED } from "../lib/colors";

export default function FreeTextRuleForm({ races, onAddAttrRule, onAddTrendRule, locked = false, onLockedAttempt }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | preview | error
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState(null);

  const inputStyle = { background: PAPER, border: `1px solid ${INK}`, color: INK };

  const handleParse = async () => {
    if (!text.trim()) return;
    setStatus("loading");
    setErrorMessage("");

    const { data, error } = await supabase.functions.invoke("parse-rule", {
      body: { text: text.trim() },
    });

    if (error || data?.error) {
      setStatus("error");
      setErrorMessage(data?.error || error.message);
      return;
    }

    setResult(data);
    setStatus("preview");
  };

  const handleConfirm = () => {
    if (result.kind === "attr") {
      onAddAttrRule({ type: result.type, value: result.value, score: Number(result.score) });
    } else if (result.kind === "trend") {
      onAddTrendRule({
        race: result.race,
        type: result.type,
        value: result.value,
        score: Number(result.score),
        label: result.label,
      });
    }
    if (locked) {
      onLockedAttempt?.();
    } else {
      setText("");
      setResult(null);
      setStatus("idle");
    }
  };

  const handleRetry = () => {
    setResult(null);
    setStatus("idle");
    setErrorMessage("");
  };

  return (
    <div className="p-4 mb-4" style={{ background: PAPER_CARD, border: `1px solid ${INK}` }}>
      <div className="text-xs font-semibold mb-3" style={{ color: MUTED }}>
        文章を入力すると、AIがルールの形に変換します
      </div>

      {status === "preview" && result ? (
        <div>
          <div className="p-3 mb-3" style={{ background: PAPER, border: `1px solid ${INK}` }}>
            <div className="text-xs mb-1" style={{ color: MUTED }}>
              こう登録します
            </div>
            <div className="text-sm" style={{ color: INK }}>
              <span className="font-semibold px-1.5 py-0.5 mr-1.5" style={{ border: `1px solid ${INK}` }}>
                {result.kind === "attr" ? result.type : result.race}
              </span>
              {result.kind === "attr" ? result.value : result.label}
              <span className="font-bold ml-2" style={{ color: result.score >= 0 ? INK : RED }}>
                {result.score > 0 ? "+" : ""}
                {result.score}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 font-bold text-sm"
              style={{ background: INK, color: PAPER, fontFamily: "'Shippori Mincho', serif" }}
            >
              <Check size={16} /> この内容で追加
            </button>
            <button
              onClick={handleRetry}
              className="flex items-center justify-center gap-1.5 py-2.5 px-4 font-semibold text-sm"
              style={{ border: `1px solid ${INK}`, color: INK }}
            >
              <RotateCcw size={14} /> やり直す
            </button>
          </div>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例: 菊花賞は3歳馬が来ない、-5点くらいで&#10;例: キズナ産駒は+3点にしたい"
            rows={3}
            className="w-full px-3 py-2 text-sm mb-3 outline-none resize-none"
            style={inputStyle}
          />
          {status === "error" && (
            <p className="text-xs mb-3" style={{ color: RED }}>
              {errorMessage}
            </p>
          )}
          <button
            onClick={handleParse}
            disabled={status === "loading"}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 font-bold text-sm"
            style={{ background: INK, color: PAPER, fontFamily: "'Shippori Mincho', serif" }}
          >
            <Wand2 size={16} /> {status === "loading" ? "解析中…" : "解析する"}
          </button>
        </>
      )}
    </div>
  );
}
