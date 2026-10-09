"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HomePageLoader } from "@/components/home-page-loader";
import { HomeRedirect } from "@/components/home-redirect";
import type { EntityType } from "@/lib/types";

const ShopPageLoader = lazy(() =>
  import("@/components/shop-page-loader").then((module) => ({
    default: module.ShopPageLoader,
  })),
);
const EditDetailClient = lazy(() =>
  import("@/components/edit-detail-client").then((module) => ({
    default: module.EditDetailClient,
  })),
);

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
  const [location, setLocation] = useState<{
    pathname: string;
    search: string;
  } | null>(null);
  useEffect(() => {
    setLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    });
  }, []);
  useEffect(() => {
    if (!location) return;
    const legacyBrand = /^\/shops\/([^/]+)\/brands\/[^/]+\/?$/.exec(
      location.pathname,
    );
    if (legacyBrand) window.location.replace(`/shops/${legacyBrand[1]}`);
    else if (location.pathname === "/admin/brand-requests")
      window.location.replace("/brands");
  }, [location]);
  if (!location) return <main id="main" className="explore" />;
  if (location.pathname === "/") {
    const entryKey = entryParamNames
      .map((name) => `${name}=${searchParams.get(name) ?? ""}`)
      .join("&");
    return <HomePageLoader key={entryKey} ready={ready} />;
  }
  const shop = /^\/shops\/([^/]+)\/?$/.exec(location.pathname);
  if (shop)
    return (
      <Suspense fallback={<main id="main" className="page shop-page" />}>
        <ShopPageLoader
          shopId={decodeURIComponent(shop[1])}
          query={location.search}
        />
      </Suspense>
    );
  const edit = /^\/edit\/(shop|brand|brewery)\/([^/]+)\/?$/.exec(
    location.pathname,
  );
  if (edit)
    return (
      <Suspense fallback={<main id="main" className="page narrow" />}>
        <EditDetailClient
          type={edit[1] as EntityType}
          recordId={decodeURIComponent(edit[2])}
          query={location.search}
        />
      </Suspense>
    );
  return <HomeRedirect />;
}
