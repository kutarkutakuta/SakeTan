"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { errorMessage, fetchJson, mutate } from "@/lib/client";
import type { Brand, BrandStatusItem } from "@/lib/types";
import { useToast } from "@/components/toast-provider";

export function BrandReviewActions({
  brand,
  onReviewed,
}: {
  brand: BrandStatusItem;
  onReviewed: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const pending = brand.registration_status === "pending";
  const [busy, setBusy] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeResults, setMergeResults] = useState<Brand[]>([]);
  const [mergeSearching, setMergeSearching] = useState(false);
  const [mergeError, setMergeError] = useState("");

  useEffect(() => {
    const normalized = mergeQuery.trim();
    setMergeResults([]);
    setMergeError("");
    if (!mergeOpen || !normalized) {
      setMergeSearching(false);
      return;
    }
    const controller = new AbortController();
    setMergeSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await fetchJson<{ brands: Brand[] }>(
          `/api/search?scope=brands&q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
          "統合先を検索できませんでした",
        );
        setMergeResults(
          data.brands.filter(
            (candidate) =>
              candidate.id !== brand.id &&
              candidate.registration_status !== "pending",
          ),
        );
      } catch (reason) {
        if (!controller.signal.aborted)
          setMergeError(errorMessage(reason, "統合先を検索できませんでした"));
      } finally {
        if (!controller.signal.aborted) setMergeSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [brand.id, mergeOpen, mergeQuery]);

  async function review(
    action: "merge" | "reject",
    targetBrandId: string | null = null,
  ) {
    setBusy(true);
    try {
      await mutate({
        kind: "brand_application_review",
        brand_id: brand.id,
        action,
        target_brand_id: targetBrandId,
        brewery_id: null,
        brewery_name: null,
        brewery_name_kana: null,
        brewery_prefecture: null,
        brewery_website_url: null,
      });
      showToast(
        action === "merge" ? "既存銘柄へ統合しました" : "申請を却下しました",
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
          className="button small ghost"
          disabled={busy}
          type="button"
          onClick={() => setMergeOpen((current) => !current)}
        >
          既存銘柄に統合
        </button>
        {pending && (
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
        )}
      </div>
      {mergeOpen && (
        <div className="brand-merge-picker">
          <label className="searchbox">
            <Search size={18} />
            <input
              value={mergeQuery}
              onChange={(event) => setMergeQuery(event.target.value)}
              maxLength={150}
              placeholder="統合先の銘柄・酒蔵を検索"
              aria-label="統合先の銘柄・酒蔵を検索"
            />
            {mergeQuery && (
              <button
                type="button"
                onClick={() => setMergeQuery("")}
                aria-label="検索をクリア"
              >
                <X size={18} />
              </button>
            )}
          </label>
          {mergeSearching && <p className="hint">検索しています…</p>}
          {mergeError && (
            <p className="notice error" role="alert">
              {mergeError}
            </p>
          )}
          {!mergeSearching &&
            !mergeError &&
            mergeQuery.trim() &&
            mergeResults.length === 0 && (
              <p className="hint">登録済みの統合先が見つかりません。</p>
            )}
          <div className="brand-merge-results">
            {mergeResults.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                disabled={busy}
                onClick={() => void review("merge", candidate.id)}
              >
                <strong>{candidate.name}</strong>
                <span>{candidate.brewery_name ?? "酒蔵未登録"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
