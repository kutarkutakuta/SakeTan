"use client";

import { useSearchParams } from "next/navigation";
import { HomePageLoader } from "@/components/home-page-loader";

const entryParamNames = [
  "brand_id",
  "shop_id",
  "map_lat",
  "map_lng",
  "map_zoom",
  "error",
] as const;

export function HomeEntry({ ready }: { ready: boolean }) {
  const searchParams = useSearchParams();
  const entryKey = entryParamNames
    .map((name) => `${name}=${searchParams.get(name) ?? ""}`)
    .join("&");
  return <HomePageLoader key={entryKey} ready={ready} />;
}
