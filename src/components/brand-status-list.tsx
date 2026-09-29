"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { BrandReviewActions } from "@/components/brand-review-actions";
import { errorMessage, fetchJson } from "@/lib/client";
import type { BrandStatusItem } from "@/lib/types";

type StatusData = {
  items: BrandStatusItem[];
  count: number;
  page: number;
  pageSize: number;
  admin: boolean;
};

export function BrandStatusList() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "approved">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          status,
          page: String(page),
        });
        const result = await fetchJson<StatusData>(
          `/api/brand-statuses?${params}`,
          { cache: "no-store", signal },
          "銘柄の状態を取得できませんでした",
        );
        setData(result);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError"))
          setError(errorMessage(reason, "銘柄の状態を取得できませんでした"));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, query, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  return (
    <>
      <div className="brand-status-controls card">
        <label className="searchbox">
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="銘柄名・酒蔵名・かなで検索"
            aria-label="銘柄名・酒蔵名・かなで検索"
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
        <label>
          登録状態
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="all">すべて</option>
            <option value="pending">申請中</option>
            <option value="approved">登録済み</option>
          </select>
        </label>
      </div>

      {loading && !data && (
        <p className="muted">銘柄の状態を読み込んでいます…</p>
      )}
      {error && <p className="notice error">{error}</p>}
      {data && (
        <p className="brand-status-summary" aria-live="polite">
          {data.count}件
        </p>
      )}
      <div className="brand-status-list">
        {data?.items.map((brand) => {
          const pending = brand.registration_status === "pending";
          const brewery =
            brand.breweries?.name ??
            brand.requested_brewery_name ??
            "酒蔵未登録";
          const date = pending ? brand.created_at : brand.registered_at;
          return (
            <article className="card brand-status-card" key={brand.id}>
              <div className="brand-status-card-head">
                <div>
                  <span
                    className={`status-badge ${pending ? "pending" : "approved"}`}
                  >
                    {pending ? "申請中" : "登録済み"}
                  </span>
                  <h2>
                    {brand.name}
                    {brand.name_kana && (
                      <span className="brand-status-kana">
                        {brand.name_kana}
                      </span>
                    )}
                  </h2>
                  <p>{brewery}</p>
                </div>
                <div className="brand-status-card-links">
                  <a href={`/edit/brand/${brand.id}`}>かなを編集</a>
                  <Link href={`/history?type=brand&id=${brand.id}`}>
                    更新履歴
                  </Link>
                </div>
              </div>
              <dl className="brand-status-meta">
                <div>
                  <dt>{pending ? "申請日" : "登録日"}</dt>
                  <dd>
                    {date
                      ? new Intl.DateTimeFormat("ja-JP", {
                          dateStyle: "medium",
                          timeZone: "Asia/Tokyo",
                        }).format(new Date(date))
                      : "不明"}
                  </dd>
                </div>
                <div>
                  <dt>取扱店舗</dt>
                  <dd>{brand.shops.length}店</dd>
                </div>
              </dl>
              {brand.shops.length > 0 ? (
                <div className="brand-status-shops">
                  {brand.shops.map((shop) => (
                    <a href={`/shops/${shop.id}`} key={shop.id}>
                      {shop.name}
                      {shop.status === "unavailable" && "（現在は取扱なし）"}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="hint">取扱店舗はまだ登録されていません。</p>
              )}
              {pending && data.admin && (
                <div className="brand-status-admin">
                  <p>
                    <strong>申請理由：</strong>
                    {brand.application_reason ?? "記載なし"}
                  </p>
                  <BrandReviewActions
                    brandId={brand.id}
                    onReviewed={() => load()}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
      {data && !loading && data.items.length === 0 && (
        <div className="card empty">
          <h2>条件に合う銘柄がありません</h2>
        </div>
      )}
      {data && (
        <div className="actions brand-status-paging">
          {page > 1 && (
            <button
              className="button small ghost"
              type="button"
              onClick={() => setPage(page - 1)}
            >
              前の30件
            </button>
          )}
          {data.count > page * data.pageSize && (
            <button
              className="button small ghost"
              type="button"
              onClick={() => setPage(page + 1)}
            >
              次の30件
            </button>
          )}
        </div>
      )}
    </>
  );
}
