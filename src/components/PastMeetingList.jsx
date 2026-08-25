import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchPastMeetingDays } from "../data/raceSource";
import { PAPER_CARD, INK, MUTED } from "../lib/colors";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(rawDate) {
  const d = new Date(`${rawDate}T00:00:00+09:00`);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export default function PastMeetingList() {
  const [days, setDays] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPastMeetingDays(12).then(setDays);
  }, []);

  return (
    <div className="px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold mb-1" style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}>
        過去レース一覧
      </h1>
      <p className="text-xs mb-4" style={{ color: MUTED }}>
        終了した開催日を選んで、印の答え合わせができます
      </p>

      {days === null && (
        <p className="text-xs" style={{ color: MUTED }}>
          読み込み中…
        </p>
      )}
      {days !== null && days.length === 0 && (
        <p className="text-xs" style={{ color: MUTED }}>
          過去の開催データがまだありません
        </p>
      )}

      <div className="space-y-2">
        {days?.map((d) => (
          <button
            key={d.day}
            onClick={() => navigate(`/history/${d.day}`)}
            className="w-full text-left p-4 flex items-center justify-between active:opacity-70 transition-opacity"
            style={{ background: PAPER_CARD, border: `1px solid ${INK}` }}
          >
            <div>
              <div className="font-bold text-sm" style={{ color: INK, fontFamily: "'Shippori Mincho', serif" }}>
                {formatDateLabel(d.rawDate)}
              </div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                {d.placeCount}会場・{d.raceCount}レース
              </div>
            </div>
            <ChevronRight size={18} color={INK} />
          </button>
        ))}
      </div>
    </div>
  );
}
