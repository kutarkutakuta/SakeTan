"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Brand, Shop, ShopCommentSummary } from "@/lib/types";

export type ShopBrandPreview = { brands: Brand[]; total: number };

export function useShopMetadata(
  visibleShops: Shop[],
  mapShops: Shop[],
  setError: Dispatch<SetStateAction<string>>,
  commentShops: Shop[] = visibleShops,
) {
  const [brandPreviews, setBrandPreviews] = useState<
    Record<string, ShopBrandPreview>
  >({});
  const [allBrands, setAllBrands] = useState<Record<string, Brand[]>>({});
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null);
  const [loadingShopId, setLoadingShopId] = useState<string | null>(null);
  const [commentSummaries, setCommentSummaries] = useState<
    Record<string, ShopCommentSummary>
  >({});
  const [brandTotals, setBrandTotals] = useState<Record<string, number>>({});
  const commentShopIds = Array.from(
    new Set(commentShops.map((shop) => shop.id)),
  )
    .sort()
    .join(",");

  useEffect(() => {
    const abort = new AbortController();
    const ids = visibleShops.map((shop) => shop.id);
    if (!ids.length) {
      setBrandPreviews({});
      return () => abort.abort();
    }
    setBrandPreviews({});
    void fetchInChunks<ShopBrandPreview>(
      ids,
      (chunk) => `/api/shops/brands?ids=${encodeURIComponent(chunk.join(","))}`,
      abort.signal,
    )
      .then(setBrandPreviews)
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(errorMessage(reason, "取扱銘柄を取得できませんでした"));
      });
    return () => abort.abort();
  }, [setError, visibleShops]);

  useEffect(() => {
    const abort = new AbortController();
    const ids = commentShopIds ? commentShopIds.split(",") : [];
    if (!ids.length) {
      setCommentSummaries({});
      return () => abort.abort();
    }
    void fetchInChunks<ShopCommentSummary>(
      ids,
      (chunk) =>
        `/api/shops/comments?ids=${encodeURIComponent(chunk.join(","))}`,
      abort.signal,
    )
      .then(setCommentSummaries)
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(errorMessage(reason, "最新コメントを取得できませんでした"));
      });
    return () => abort.abort();
  }, [commentShopIds, setError]);

  useEffect(() => {
    const abort = new AbortController();
    const ids = Array.from(
      new Set([...mapShops, ...commentShops].map((shop) => shop.id)),
    );
    if (!ids.length) {
      setBrandTotals({});
      return () => abort.abort();
    }
    setBrandTotals({});
    void fetchInChunks<number>(
      ids,
      (chunk) =>
        `/api/shops/brand-totals?ids=${encodeURIComponent(chunk.join(","))}`,
      abort.signal,
    )
      .then(setBrandTotals)
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(errorMessage(reason, "取扱銘柄数を取得できませんでした"));
      });
    return () => abort.abort();
  }, [commentShops, mapShops, setError]);

  const toggleBrands = useCallback(
    async (shopId: string) => {
      if (expandedShopId === shopId) {
        setExpandedShopId(null);
        return;
      }
      if (allBrands[shopId]) {
        setExpandedShopId(shopId);
        return;
      }
      setLoadingShopId(shopId);
      setError("");
      try {
        const response = await fetch(`/api/shops/${shopId}/brands`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setAllBrands((current) => ({ ...current, [shopId]: data }));
        setExpandedShopId(shopId);
      } catch (reason) {
        setError(errorMessage(reason, "取扱銘柄を取得できませんでした"));
      } finally {
        setLoadingShopId((current) => (current === shopId ? null : current));
      }
    },
    [allBrands, expandedShopId, setError],
  );

  const collapseBrands = useCallback(() => setExpandedShopId(null), []);

  return {
    allBrands,
    brandTotals,
    brandPreviews,
    collapseBrands,
    expandedShopId,
    commentSummaries,
    loadingShopId,
    toggleBrands,
  };
}

async function fetchInChunks<T>(
  ids: string[],
  endpoint: (ids: string[]) => string,
  signal: AbortSignal,
) {
  const chunks = Array.from(
    { length: Math.ceil(ids.length / 50) },
    (_, index) => ids.slice(index * 50, index * 50 + 50),
  );
  const parts = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await fetch(endpoint(chunk), { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data as Record<string, T>;
    }),
  );
  return Object.assign({}, ...parts) as Record<string, T>;
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
