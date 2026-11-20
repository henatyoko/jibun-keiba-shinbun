import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// SPAの画面遷移(URLが変わった時)をGTMのdataLayerに送る。
// 初回表示分はGTM自身のページビューで計測されるので、2回目以降の遷移だけ送る(二重計上を避ける)。
// GTM側では、カスタムイベント「virtual_page_view」をトリガーにGA4のpage_viewタグを発火させる。
export default function RouteTracker() {
  const location = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "virtual_page_view",
      page_path: location.pathname + location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location.pathname, location.search]);

  return null;
}
