"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import { mutate } from "@/lib/client";
import type { Shop } from "@/lib/types";
import { useToast } from "@/components/toast-provider";

type CopyTargetSummary = {
  id: string;
  name: string;
  prefecture: string | null;
  city: string | null;
  add_count: number;
  skip_count: number;
};

export type ShopBrandCopyResult = {
  source_name: string;
  source_count: number;
  target_count: number;
  add_count: number;
  skip_count: number;
  copied_count?: number;
  targets: CopyTargetSummary[];
};

function shopLocation(shop: Pick<Shop, "prefecture" | "city">) {
  return (
    [shop.prefecture, shop.city].filter(Boolean).join(" ") || "所在地未登録"
  );
}

export function ShopBrandCopyDialog({
  sourceShop,
  availableCount,
  onClose,
  onCopied,
}: {
  sourceShop: Pick<Shop, "id" | "name">;
  availableCount: number;
  onClose: () => void;
  onCopied: (result: ShopBrandCopyResult) => void;
}) {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Shop[]>([]);
  const [selected, setSelected] = useState<Map<string, Shop>>(new Map());
  const [searchBusy, setSearchBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [preview, setPreview] = useState<ShopBrandCopyResult | null>(null);
  const [searchError, setSearchError] = useState("");
  const selectedIds = useMemo(() => [...selected.keys()], [selected]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !copyBusy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [copyBusy, onClose]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setResults([]);
      setSearchBusy(false);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setSearchBusy(true);
      setSearchError("");
      try {
        const response = await fetch(
          `/api/search?scope=shops&q=${encodeURIComponent(normalizedQuery)}`,
          { signal: abort.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "酒屋を検索できませんでした");
        setResults(
          (Array.isArray(data.shops) ? (data.shops as Shop[]) : []).filter(
            (shop) => shop.id !== sourceShop.id,
          ),
        );
      } catch (reason) {
        if (!abort.signal.aborted)
          setSearchError(
            reason instanceof Error
              ? reason.message
              : "酒屋を検索できませんでした",
          );
      } finally {
        if (!abort.signal.aborted) setSearchBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, sourceShop.id]);

  useEffect(() => {
    if (!selectedIds.length) {
      setPreview(null);
      setPreviewBusy(false);
      return;
    }
    const abort = new AbortController();
    setPreviewBusy(true);
    setPreview(null);
    void (async () => {
      try {
        const params = new URLSearchParams({
          source_id: sourceShop.id,
          target_ids: selectedIds.join(","),
        });
        const response = await fetch(
          `/api/shops/brands/copy-preview?${params}`,
          { signal: abort.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "コピー内容を確認できませんでした");
        setPreview(data as ShopBrandCopyResult);
      } catch (reason) {
        if (!abort.signal.aborted)
          showToast(
            reason instanceof Error
              ? reason.message
              : "コピー内容を確認できませんでした",
            "error",
          );
      } finally {
        if (!abort.signal.aborted) setPreviewBusy(false);
      }
    })();
    return () => abort.abort();
  }, [selectedIds, showToast, sourceShop.id]);

  function toggleShop(shop: Shop) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(shop.id)) next.delete(shop.id);
      else if (next.size < 10) next.set(shop.id, shop);
      return next;
    });
  }

  async function copyBrands() {
    if (!preview?.add_count || copyBusy) return;
    setCopyBusy(true);
    try {
      const result = await mutate<ShopBrandCopyResult>({
        kind: "shop_brand_copy",
        source_shop_id: sourceShop.id,
        target_shop_ids: selectedIds,
      });
      onCopied(result.id);
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "コピーできませんでした",
        "error",
      );
    } finally {
      setCopyBusy(false);
    }
  }

  return (
    <div
      className="shop-copy-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !copyBusy) onClose();
      }}
    >
      <section
        className="shop-copy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-copy-title"
      >
        <div className="shop-copy-handle" aria-hidden="true" />
        <div className="shop-copy-head">
          <div>
            <span className="eyebrow">{sourceShop.name}の取扱情報</span>
            <h2 id="shop-copy-title">他店舗へコピー</h2>
          </div>
          <button
            type="button"
            className="shop-copy-close"
            aria-label="閉じる"
            disabled={copyBusy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <p className="shop-copy-description">
          「取扱あり」の{availableCount}
          銘柄をコピーします。コピー先にある情報と、発見日・投稿は変更しません。
        </p>

        <label className="shop-copy-search">
          <span>コピー先の酒屋を検索</span>
          <span className="searchbox">
            <Search size={19} />
            <input
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="酒屋名・かな"
            />
            {query && (
              <button
                type="button"
                aria-label="検索をクリア"
                onClick={() => setQuery("")}
              >
                <X size={18} />
              </button>
            )}
          </span>
        </label>

        <div className="shop-copy-selection-head">
          <strong>コピー先</strong>
          <span>{selected.size}/10店舗</span>
        </div>

        {selected.size > 0 && (
          <div className="shop-copy-selected" aria-label="選択したコピー先">
            {[...selected.values()].map((shop) => (
              <button
                type="button"
                key={shop.id}
                onClick={() => toggleShop(shop)}
                disabled={copyBusy}
                aria-label={`${shop.name}をコピー先から外す`}
              >
                <span>{shop.name}</span>
                <X size={16} />
              </button>
            ))}
          </div>
        )}

        {query.trim() && (
          <div className="shop-copy-results" aria-live="polite">
            {searchBusy ? (
              <p>検索しています…</p>
            ) : results.length ? (
              results.map((shop) => {
                const checked = selected.has(shop.id);
                return (
                  <label className="shop-copy-result" key={shop.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && selected.size >= 10}
                      onChange={() => toggleShop(shop)}
                    />
                    <span>
                      <strong>{shop.name}</strong>
                      <small>{shopLocation(shop)}</small>
                    </span>
                    {checked && <Check size={19} aria-hidden="true" />}
                  </label>
                );
              })
            ) : (
              <p>条件に合う酒屋がありません。</p>
            )}
          </div>
        )}

        {selected.size > 0 && (
          <section className="shop-copy-preview" aria-live="polite">
            <h3>コピー内容</h3>
            {previewBusy ? (
              <p>確認しています…</p>
            ) : preview ? (
              <>
                <div className="shop-copy-totals">
                  <div>
                    <strong>{preview.add_count}</strong>
                    <span>追加</span>
                  </div>
                  <div>
                    <strong>{preview.skip_count}</strong>
                    <span>既存のためスキップ</span>
                  </div>
                </div>
                <ul>
                  {preview.targets.map((target) => (
                    <li key={target.id}>
                      <span>{target.name}</span>
                      <span>
                        追加 {target.add_count}件／スキップ {target.skip_count}
                        件
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        )}

        {searchError && (
          <p className="notice error" role="alert">
            {searchError}
          </p>
        )}

        <div className="shop-copy-actions">
          <button
            type="button"
            className="button ghost"
            disabled={copyBusy}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="button"
            disabled={copyBusy || previewBusy || !preview?.add_count}
            onClick={() => void copyBrands()}
          >
            <Copy size={18} />
            {copyBusy
              ? "コピーしています…"
              : preview?.add_count
                ? `${preview.add_count}件をコピー`
                : "コピー対象なし"}
          </button>
        </div>
      </section>
    </div>
  );
}
