import { Suspense } from "react";
import { HomePageLoader } from "@/components/home-page-loader";
import { configured } from "@/lib/supabase/server";

type HomeSearchParams = Record<string, string | string[] | undefined>;

const homeEntryParamNames = [
  "brand_id",
  "shop_id",
  "map_lat",
  "map_lng",
  "map_zoom",
  "error",
] as const;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  const params = await searchParams;
  const entryKey = homeEntryParamNames
    .map((name) => `${name}=${firstParam(params[name])}`)
    .join("&");

  return (
    <Suspense fallback={<main id="main" className="explore" />}>
      <HomePageLoader key={entryKey} ready={configured()} />
    </Suspense>
  );
}
