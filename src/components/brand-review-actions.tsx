"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { PrefectureRadioGroup } from "@/components/prefecture-radio-group";
import { errorMessage, fetchJson, mutate } from "@/lib/client";
import type { Brand, BrandStatusItem, Brewery } from "@/lib/types";
import { useToast } from "@/components/toast-provider";

type BreweryMode = "existing" | "new";

export function BrandReviewActions({
  brand,
  onReviewed,
}: {
  brand: BrandStatusItem;
  onReviewed: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const needsBrewery = !brand.brewery_id;
  const requestedBreweryName = brand.requested_brewery_name?.trim() ?? "";
  const [busy, setBusy] = useState(false);
  const [breweryMode, setBreweryMode] = useState<BreweryMode>("existing");
  const [breweryQuery, setBreweryQuery] = useState(requestedBreweryName);
  const [breweryResults, setBreweryResults] = useState<Brewery[]>([]);
  const [selectedBrewery, setSelectedBrewery] = useState<Brewery | null>(null);
  const [brewerySearching, setBrewerySearching] = useState(false);
  const [newBreweryName, setNewBreweryName] = useState(requestedBreweryName);
  const [newBreweryKana, setNewBreweryKana] = useState("");
  const [newBreweryPrefecture, setNewBreweryPrefecture] = useState("");
  const [newBreweryWebsite, setNewBreweryWebsite] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeResults, setMergeResults] = useState<Brand[]>([]);
  const [mergeSearching, setMergeSearching] = useState(false);

  useEffect(() => {
    const normalized = breweryQuery.trim();
    if (!needsBrewery || breweryMode !== "existing" || !normalized) {
      setBreweryResults([]);
      setBrewerySearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBrewerySearching(true);
      try {
        const data = await fetchJson<Brewery[]>(
          `/api/breweries?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
          "酒蔵を検索できませんでした",
        );
        setBreweryResults(data);
      } catch (reason) {
        if (!controller.signal.aborted)
          showToast(
            errorMessage(reason, "酒蔵を検索できませんでした"),
            "error",
          );
      } finally {
        if (!controller.signal.aborted) setBrewerySearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [breweryMode, breweryQuery, needsBrewery, showToast]);

  useEffect(() => {
    const normalized = mergeQuery.trim();
    if (!mergeOpen || !normalized) {
      setMergeResults([]);
      setMergeSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setMergeSearching(true);
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
          showToast(
            errorMessage(reason, "統合先を検索できませんでした"),
            "error",
          );
      } finally {
        if (!controller.signal.aborted) setMergeSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [brand.id, mergeOpen, mergeQuery, showToast]);

  const approvalReady =
    !needsBrewery ||
    (breweryMode === "existing" && Boolean(selectedBrewery)) ||
    (breweryMode === "new" &&
      Boolean(newBreweryName.trim()) &&
      Boolean(newBreweryPrefecture));

  async function review(
    action: "approve" | "merge" | "reject",
    targetBrandId: string | null = null,
  ) {
    if (action === "approve" && !approvalReady) {
      showToast(
        breweryMode === "existing"
          ? "紐付ける酒蔵を選択してください"
          : "酒蔵名と都道府県を入力してください",
        "error",
      );
      return;
    }
    if (
      action === "approve" &&
      breweryMode === "new" &&
      newBreweryWebsite.trim() &&
      !/^https?:\/\//u.test(newBreweryWebsite.trim())
    ) {
      showToast(
        "公式サイトは http または https のURLを入力してください",
        "error",
      );
      return;
    }
    setBusy(true);
    try {
      const createBrewery =
        action === "approve" && needsBrewery && breweryMode === "new";
      await mutate({
        kind: "brand_application_review",
        brand_id: brand.id,
        action,
        target_brand_id: targetBrandId,
        brewery_id:
          action === "approve" && needsBrewery && breweryMode === "existing"
            ? (selectedBrewery?.id ?? null)
            : null,
        brewery_name: createBrewery ? newBreweryName.trim() : null,
        brewery_name_kana: createBrewery ? newBreweryKana.trim() || null : null,
        brewery_prefecture: createBrewery ? newBreweryPrefecture : null,
        brewery_website_url: createBrewery
          ? newBreweryWebsite.trim() || null
          : null,
      });
      showToast(
        action === "approve"
          ? createBrewery
            ? "酒蔵を登録し、銘柄申請を承認しました"
            : "銘柄登録を承認しました"
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
      {needsBrewery && (
        <section
          className="brand-review-brewery"
          aria-labelledby={`brewery-${brand.id}`}
        >
          <div>
            <h3 id={`brewery-${brand.id}`}>酒蔵を確定</h3>
            <p className="hint">申請された酒蔵名：{requestedBreweryName}</p>
          </div>
          <div
            className="brand-review-brewery-modes"
            role="radiogroup"
            aria-label="酒蔵の登録方法"
          >
            <label>
              <input
                type="radio"
                name={`brewery-mode-${brand.id}`}
                checked={breweryMode === "existing"}
                onChange={() => setBreweryMode("existing")}
              />
              <span>既存酒蔵を選択</span>
            </label>
            <label>
              <input
                type="radio"
                name={`brewery-mode-${brand.id}`}
                checked={breweryMode === "new"}
                onChange={() => setBreweryMode("new")}
              />
              <span>新しい酒蔵を登録</span>
            </label>
          </div>
          {breweryMode === "existing" ? (
            <div className="brand-review-brewery-existing">
              <label className="searchbox">
                <Search size={18} />
                <input
                  value={breweryQuery}
                  onChange={(event) => {
                    setBreweryQuery(event.target.value);
                    setSelectedBrewery(null);
                  }}
                  placeholder="酒蔵名・かなを検索"
                  aria-label="紐付ける酒蔵を検索"
                />
                {breweryQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setBreweryQuery("");
                      setSelectedBrewery(null);
                    }}
                    aria-label="検索をクリア"
                  >
                    <X size={18} />
                  </button>
                )}
              </label>
              {brewerySearching && <p className="hint">検索しています…</p>}
              {!brewerySearching &&
                breweryQuery.trim() &&
                breweryResults.length === 0 && (
                  <p className="hint">
                    登録済みの酒蔵が見つかりません。新しい酒蔵として登録してください。
                  </p>
                )}
              <div className="brand-merge-results">
                {breweryResults.map((brewery) => (
                  <button
                    type="button"
                    key={brewery.id}
                    disabled={busy}
                    aria-pressed={selectedBrewery?.id === brewery.id}
                    onClick={() => setSelectedBrewery(brewery)}
                  >
                    <strong>{brewery.name}</strong>
                    <span>{brewery.prefecture ?? "地域未登録"}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="brand-review-brewery-form form-stack">
              <label>
                酒蔵名 <span className="required">必須</span>
                <input
                  value={newBreweryName}
                  onChange={(event) => setNewBreweryName(event.target.value)}
                  maxLength={150}
                />
              </label>
              <label>
                かな <span className="muted">任意</span>
                <input
                  value={newBreweryKana}
                  onChange={(event) => setNewBreweryKana(event.target.value)}
                  maxLength={150}
                />
              </label>
              <PrefectureRadioGroup
                name={`brewery-prefecture-${brand.id}`}
                value={newBreweryPrefecture}
                onChange={setNewBreweryPrefecture}
                required
              />
              <label>
                公式サイト <span className="muted">任意</span>
                <input
                  type="url"
                  value={newBreweryWebsite}
                  onChange={(event) => setNewBreweryWebsite(event.target.value)}
                  placeholder="https://"
                />
              </label>
            </div>
          )}
        </section>
      )}
      <div className="actions">
        <button
          className="button small"
          disabled={busy || !approvalReady}
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
              value={mergeQuery}
              onChange={(event) => setMergeQuery(event.target.value)}
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
          {!mergeSearching &&
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
