"use client";
import dynamic from "next/dynamic";
const Map = dynamic(() => import("./shop-map"), {
  ssr: false,
  loading: () => (
    <div className="map map-loading" role="status">
      地図を読み込んでいます…
    </div>
  ),
});
export default Map;
