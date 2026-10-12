"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { DirectoryCard } from "./directory-card";
import {
  useDirectoryCatalog,
  useDirectoryRelatedData,
} from "./use-directory-data";
import { BrandFilterControls } from "./brand-filter-controls";
import {
  directoryFilters,
  directoryLabels,
  directoryPage,
  directoryPaths,
  directorySearchParams,
  type DirectoryFilters,
} from "@/lib/directory-index";
import type { BrandCatalogSort } from "@/lib/brand-index";
import type { EntityType } from "@/lib/types";

export function EntityDirectory({ type }: { type: EntityType }) {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => directoryFilters(new URLSearchParams(searchParams.toString()), type),
    [searchParams, type],
  );
  const [query, setQuery] = useState(filters.query);
  const composing = useRef(false);

  useEffect(() => {
    if (!composing.current) setQuery(filters.query);
  }, [filters.query]);

  const { items, loading, error, retry } = useDirectoryCatalog(type);
  const label = directoryLabels[type];
  const pathname = directoryPaths[type];

  const result = useMemo(
    () => directoryPage(type, items, filters),
    [type, items, filters],
  );
  const relatedData = useDirectoryRelatedData(
    type,
    !loading && !error ? result.items.map((item) => item.id) : [],
  );

  const returnParams = directorySearchParams(
    { ...filters, page: result.page },
    type,
  );
  const returnTo = pathname + (returnParams.size ? `?${returnParams}` : "");
  const sortOptions: Array<[BrandCatalogSort, string]> = [
    ...(type === "brand"
      ? [["ranking", "ランキング順"] as [BrandCatalogSort, string]]
      : []),
    ["brand", `${label}順`],
    ...(type === "brand"
      ? [["brewery", "蔵元順"] as [BrandCatalogSort, string]]
      : []),
    ["region", "県順"],
  ];

  function updateFilters(patch: Partial<DirectoryFilters>) {
    // Read the latest URL so a control that clears two filters preserves both changes.
    const current = directoryFilters(
      new URLSearchParams(window.location.search),
      type,
    );
    const next = directorySearchParams({ ...current, page: 1, ...patch }, type);
    const href = pathname + (next.size ? `?${next}` : "");
    if (href === window.location.pathname + window.location.search) return;
    window.history.replaceState(null, "", href);
  }

  function pageHref(page: number) {
    const params = directorySearchParams({ ...filters, page }, type);
    return pathname + (params.size ? `?${params}` : "");
  }

  const filterConflict = Boolean(
    filters.query.trim() &&
    !result.count &&
    (filters.prefectures.size || filters.kana.size),
  );

  return (
    <>
      <div className="directory-toolbar">
        <label className="searchbox">
          <Search size={19} aria-hidden="true" />
          <input
            value={query}
            maxLength={150}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
              if (!composing.current) updateFilters({ query: value });
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              const value = event.currentTarget.value;
              setQuery(value);
              updateFilters({ query: value });
            }}
            placeholder={
              type === "brand"
                ? "銘柄名・酒蔵名・かなで検索"
                : `${label}名・かなで検索`
            }
            aria-label={
              type === "brand"
                ? "銘柄名・酒蔵名・かなで検索"
                : `${label}名・かなで検索`
            }
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                updateFilters({ query: "" });
              }}
              aria-label="検索をクリア"
            >
              <X size={18} />
            </button>
          )}
        </label>
        {type === "brand" && (
          <label className="directory-status-select">
            <span>登録状態</span>
            <select
              value={filters.status}
              onChange={(event) =>
                updateFilters({
                  status: event.target.value as DirectoryFilters["status"],
                })
              }
            >
              <option value="all">すべて</option>
              <option value="approved">登録済み</option>
              <option value="pending">申請中</option>
            </select>
          </label>
        )}
      </div>
      <BrandFilterControls
        selectedPrefectures={filters.prefectures}
        onPrefecturesChange={(prefectures) => updateFilters({ prefectures })}
        selectedTargets={filters.targets}
        onTargetsChange={(targets) => updateFilters({ targets })}
        selectedKana={filters.kana}
        onKanaChange={(kana) => updateFilters({ kana })}
        showTargets={type === "brand"}
        sort={filters.sort}
        onSortChange={(sort) => updateFilters({ sort })}
        sortOptions={sortOptions}
        emphasizePrefectures={filterConflict && filters.prefectures.size > 0}
        emphasizeKana={filterConflict && filters.kana.size > 0}
      />
      {loading && (
        <p className="directory-feedback" role="status">
          {label}一覧を読み込んでいます…
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button className="button small ghost" type="button" onClick={retry}>
            再読み込み
          </button>
        </div>
      )}
      {!loading && !error && (
        <>
          <p className="directory-count" aria-live="polite">
            {result.count
              ? `${result.count}件中 ${result.start + 1}–${result.start + result.items.length}件`
              : "0件"}
            {(filters.query ||
              filters.prefectures.size > 0 ||
              filters.kana.size > 0 ||
              (type === "brand" && filters.status !== "all")) && (
              <span>（全{items.length}件）</span>
            )}
          </p>
          <div className="brand-list directory-list">
            {result.items.map((item) => {
              return (
                <DirectoryCard
                  key={item.id}
                  type={type}
                  item={item}
                  returnTo={returnTo}
                  relatedCount={relatedData.counts[item.id]}
                  breweryBrands={relatedData.brands[item.id]}
                  error={Boolean(relatedData.error)}
                  onFilterChange={updateFilters}
                />
              );
            })}
          </div>
          {relatedData.error && (
            <div className="notice error" role="alert">
              {relatedData.error}
              <button
                className="button small ghost"
                type="button"
                onClick={relatedData.retry}
              >
                再読み込み
              </button>
            </div>
          )}
          {!result.count && (
            <p className="directory-feedback">
              {filterConflict
                ? "テキスト検索に一致しません。選択中の都道府県・かなも確認してください。"
                : `条件に合う${label}がありません`}
            </p>
          )}
          {result.pageCount > 1 && (
            <nav
              className="directory-paging"
              aria-label={`${label}一覧のページ切り替え`}
            >
              {result.page > 1 ? (
                <Link
                  className="button small ghost"
                  href={pageHref(result.page - 1)}
                >
                  <ChevronLeft size={17} />
                  前へ
                </Link>
              ) : (
                <span />
              )}
              <span aria-current="page">
                {result.page} / {result.pageCount}ページ
              </span>
              {result.page < result.pageCount ? (
                <Link
                  className="button small ghost"
                  href={pageHref(result.page + 1)}
                >
                  次へ
                  <ChevronRight size={17} />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
