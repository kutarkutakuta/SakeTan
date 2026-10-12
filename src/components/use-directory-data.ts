"use client";

import { useEffect, useState } from "react";
import { loadDirectoryCatalog } from "@/lib/directory-catalog";
import { directoryLabels, type DirectoryItem } from "@/lib/directory-index";
import { loadBrandShopCounts } from "@/lib/brand-shops";
import { loadBreweryBrands, type BreweryBrand } from "@/lib/brewery-brands";
import { errorMessage, fetchJson } from "@/lib/client";
import { supabase } from "@/lib/supabase/browser";
import type { EntityType } from "@/lib/types";

export function useDirectoryCatalog(type: EntityType) {
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void loadDirectoryCatalog(type, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setItems(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            errorMessage(
              reason,
              `${directoryLabels[type]}一覧を取得できませんでした`,
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [type, revision]);
  return {
    items,
    loading,
    error,
    retry: () => setRevision((value) => value + 1),
  };
}

type RelatedData = {
  counts: Record<string, number>;
  brands: Record<string, BreweryBrand[]>;
  error: string;
};
const emptyRelatedData: RelatedData = { counts: {}, brands: {}, error: "" };
const relatedErrors = {
  brand: "取扱店舗数を取得できませんでした",
  brewery: "酒蔵の銘柄を取得できませんでした",
  shop: "取扱銘柄数を取得できませんでした",
} as const;

export function useDirectoryRelatedData(type: EntityType, ids: string[]) {
  const relatedIds = [...new Set(ids)].sort().join(",");
  const key = relatedIds ? `${type}:${relatedIds}` : "";
  const [data, setData] = useState<RelatedData & { key: string }>({
    ...emptyRelatedData,
    key: "",
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!relatedIds) return;
    const controller = new AbortController();
    void (async () => {
      let counts: Record<string, number> = {};
      let brands: Record<string, BreweryBrand[]> = {};
      if (type === "shop") {
        counts = await fetchJson<Record<string, number>>(
          `/api/shops/brand-totals?ids=${encodeURIComponent(relatedIds)}`,
          { signal: controller.signal },
          relatedErrors[type],
        );
      } else {
        const db = await supabase();
        if (!db) throw new Error("接続先が設定されていません");
        if (type === "brewery")
          brands = await loadBreweryBrands(
            db,
            relatedIds.split(","),
            controller.signal,
          );
        else
          counts = await loadBrandShopCounts(
            db,
            relatedIds.split(","),
            controller.signal,
          );
      }
      if (!controller.signal.aborted)
        setData({ key, counts, brands, error: "" });
    })().catch((reason) => {
      if (!controller.signal.aborted)
        setData({
          ...emptyRelatedData,
          key,
          error: errorMessage(reason, relatedErrors[type]),
        });
    });
    return () => controller.abort();
  }, [relatedIds, key, type, revision]);
  return {
    ...(data.key === key ? data : emptyRelatedData),
    retry: () => setRevision((value) => value + 1),
  };
}
