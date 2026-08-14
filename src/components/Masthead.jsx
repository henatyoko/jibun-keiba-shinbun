import { PAPER, INK } from "../lib/colors";

export default function Masthead({ raceCount, userEmail, onLogout }) {
  return (
    <div
      className="px-4 pt-4 pb-2 sticky top-0 z-10"
      style={{ background: INK, borderBottom: `3px double ${PAPER}` }}
    >
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl font-black tracking-wide"
          style={{ color: PAPER, fontFamily: "'Shippori Mincho', serif" }}
        >
          じぶん競馬新聞
        </h1>
        <span className="text-[10px]" style={{ color: PAPER, opacity: 0.7, fontFamily: "'Shippori Mincho', serif" }}>
          号外
        </span>
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <div className="text-[10px]" style={{ color: PAPER, opacity: 0.7 }}>
          My知見反映版・第{raceCount}競走号
        </div>
        {userEmail && (
          <div className="flex items-center gap-2 text-[10px]" style={{ color: PAPER, opacity: 0.7 }}>
            <span className="truncate max-w-[120px]">{userEmail}</span>
            <button onClick={onLogout} className="underline shrink-0">
              ログアウト
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
