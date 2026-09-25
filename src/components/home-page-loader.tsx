"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Home } from "@/components/home";
import { parseMapView, readSessionMapView, type MapView } from "@/lib/map-view";
import type { Brand, Shop } from "@/lib/types";

type ExploreContext = {
  brand: Brand | null;
  shop: Shop | null;
  error?: string;
};

export function HomePageLoader({ ready }: { ready: boolean }) {
  const searchParams = useSearchParams();
  const [initialParams] = useState(() =>
    Object.fromEntries(searchParams.entries()),
  );
  const urlMapView = useMemo(
    () => parseMapView(initialParams),
    [initialParams],
  );
  const [savedMapView, setSavedMapView] = useState<MapView | null | undefined>(
    undefined,
  );
  const brandId = initialParams.brand_id ?? "";
  const shopId = initialParams.shop_id ?? "";
  const contextQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (brandId) query.set("brand_id", brandId);
    if (shopId) query.set("shop_id", shopId);
    return query.toString();
  }, [brandId, shopId]);
  const [context, setContext] = useState<ExploreContext | null>(
    contextQuery ? null : { brand: null, shop: null },
  );
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setSavedMapView(readSessionMapView() ?? null);
  }, []);

  useEffect(() => {
    if (!contextQuery) {
      setContext({ brand: null, shop: null });
      setLoadError("");
      return;
    }
    const controller = new AbortController();
    setContext(null);
    setLoadError("");
    void fetch(`/api/explore-context?${contextQuery}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as ExploreContext;
        if (!response.ok)
          throw new Error(result.error ?? "表示条件を読み込めませんでした");
        setContext(result);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "表示条件を読み込めませんでした",
        );
        setContext({ brand: null, shop: null });
      });
    return () => controller.abort();
  }, [contextQuery]);

  if (!context || (!urlMapView && savedMapView === undefined))
    return <main id="main" className="explore" />;

  return (
    <Home
      initialBrand={context.brand}
      initialShop={context.shop}
      initialMapView={urlMapView ?? savedMapView ?? undefined}
      ready={ready}
      initialError={loadError || initialParams.error || undefined}
    />
  );
}
