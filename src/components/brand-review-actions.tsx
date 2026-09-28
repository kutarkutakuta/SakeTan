"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { errorMessage, fetchJson, mutate } from "@/lib/client";
import type { Brand } from "@/lib/types";
import { useToast } from "@/components/toast-provider";

export function BrandReviewActions({
  brandId,
  onReviewed,
}: {
  brandId: string;
  onReviewed: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Brand[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (!mergeOpen || !normalized) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetchJson<{ brands: Brand[] }>(
          `/api/search?scope=brands&q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
          "統合先を検索できませんでした",
        );
        setResults(
          data.brands.filter(
            (brand) =>
              brand.id !== brandId && brand.registration_status !== "pending",
          ),
        );
      } catch (reason) {
        if (!controller.signal.aborted)
          showToast(
            errorMessage(reason, "統合先を検索できませんでした"),
            "error",
          );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [brandId, mergeOpen, query, showToast]);

  async function review(
    action: "approve" | "merge" | "reject",
    targetBrandId: string | null = null,
  ) {
    setBusy(true);
    try {
      await mutate({
        kind: "brand_application_review",
        brand_id: brandId,
        action,
        target_brand_id: targetBrandId,
      });
      showToast(
        action === "approve"
          ? "銘柄登録を承認しました"
          : action === "merge"
            ? "既存銘柄へ統合しました"
            : "申請を却下しました",
      );
      await onReviewed();
    } catch (reason) {
      showToast(errorMessage(reason, "申請を確認できませんでした"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="brand-review-actions">
      <div className="actions">
        <button
          className="button small"
          disabled={busy}
          type="button"
          onClick={() => void review("approve")}
        >
          登録を承認
        </button>
        <button
          className="button small ghost"
          disabled={busy}
          type="button"
          onClick={() => setMergeOpen((current) => !current)}
        >
          既存銘柄に統合
        </button>
        <button
          className="button small ghost danger"
          disabled={busy}
          type="button"
          onClick={() => {
            if (window.confirm("この銘柄の申請を却下しますか？"))
              void review("reject");
          }}
        >
          却下
        </button>
      </div>
      {mergeOpen && (
        <div className="brand-merge-picker">
          <label className="searchbox">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="統合先の銘柄・酒蔵を検索"
              aria-label="統合先の銘柄・酒蔵を検索"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="検索をクリア"
              >
                <X size={18} />
              </button>
            )}
          </label>
          {searching && <p className="hint">検索しています…</p>}
          {!searching && query.trim() && results.length === 0 && (
            <p className="hint">登録済みの統合先が見つかりません。</p>
          )}
          <div className="brand-merge-results">
            {results.map((brand) => (
              <button
                type="button"
                key={brand.id}
                disabled={busy}
                onClick={() => void review("merge", brand.id)}
              >
                <strong>{brand.name}</strong>
                <span>{brand.brewery_name ?? "酒蔵未登録"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
