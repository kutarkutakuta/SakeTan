"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { BrandFilterControls } from "./brand-filter-controls";
import { BrandInfoLink } from "./brand-info-link";
import { loadDirectoryCatalog } from "@/lib/directory-catalog";
import {
  directoryFilters,
  directoryLabels,
  directoryPage,
  directoryPaths,
  directoryPrefecture,
  directorySearchParams,
  type DirectoryFilters,
  type DirectoryItem,
} from "@/lib/directory-index";
import type { BrandCatalogSort } from "@/lib/brand-index";
import { masterDetailHref } from "@/lib/master-navigation";
import { supabase } from "@/lib/supabase/browser";
import { loadBrandShopCounts } from "@/lib/brand-shops";
import { loadBreweryBrands, type BreweryBrand } from "@/lib/brewery-brands";
import {
  shopBrandRankingLabel,
  shopBrandRankingTag,
} from "@/lib/shop-brand-order";
import { errorMessage, fetchJson } from "@/lib/client";
import type { Brand, EntityType, Shop } from "@/lib/types";

export function EntityDirectory({ type }: { type: EntityType }) {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => directoryFilters(new URLSearchParams(searchParams.toString()), type),
    [searchParams, type],
  );
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [relatedData, setRelatedData] = useState<{
    key: string;
    counts: Record<string, number>;
    brands?: Record<string, BreweryBrand[]>;
    error: string;
  }>({ key: "", counts: {}, error: "" });
  const [relatedRetry, setRelatedRetry] = useState(0);
  const label = directoryLabels[type];
  const pathname = directoryPaths[type];

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
          setError(errorMessage(reason, `${label}一覧を取得できませんでした`));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [type, label, revision]);

  const result = useMemo(
    () => directoryPage(type, items, filters),
    [type, items, filters],
  );
  const relatedIds =
    !loading && !error
      ? result.items
          .map((item) => item.id)
          .sort()
          .join(",")
      : "";
  const relatedKey = relatedIds ? `${type}:${relatedIds}` : "";
  const relatedErrorMessage =
    type === "shop"
      ? "取扱銘柄数を取得できませんでした"
      : type === "brewery"
        ? "酒蔵の銘柄を取得できませんでした"
        : "取扱店舗数を取得できませんでした";
  useEffect(() => {
    if (!relatedIds) return;
    const controller = new AbortController();
    void (async () => {
      let counts: Record<string, number>;
      let brands: Record<string, BreweryBrand[]> | undefined;
      if (type === "shop") {
        counts = await fetchJson<Record<string, number>>(
          `/api/shops/brand-totals?ids=${encodeURIComponent(relatedIds)}`,
          { signal: controller.signal },
          relatedErrorMessage,
        );
      } else {
        const db = await supabase();
        if (!db) throw new Error("接続先が設定されていません");
        if (type === "brewery") {
          brands = await loadBreweryBrands(
            db,
            relatedIds.split(","),
            controller.signal,
          );
          counts = {};
        } else {
          counts = await loadBrandShopCounts(
            db,
            relatedIds.split(","),
            controller.signal,
          );
        }
      }
      if (!controller.signal.aborted)
        setRelatedData({ key: relatedKey, counts, brands, error: "" });
    })().catch((reason) => {
      if (!controller.signal.aborted)
        setRelatedData({
          key: relatedKey,
          counts: {},
          error: errorMessage(reason, relatedErrorMessage),
        });
    });
    return () => controller.abort();
  }, [relatedIds, relatedKey, type, relatedErrorMessage, relatedRetry]);
  const relatedError = relatedData.key === relatedKey ? relatedData.error : "";
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
    window.history.replaceState(
      null,
      "",
      pathname + (next.size ? `?${next}` : ""),
    );
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
            value={filters.query}
            maxLength={150}
            onChange={(event) => updateFilters({ query: event.target.value })}
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
          {filters.query && (
            <button
              type="button"
              onClick={() => updateFilters({ query: "" })}
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
          <button
            className="button small ghost"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
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
              const brand = type === "brand" ? (item as Brand) : null;
              const rankingTag = brand ? shopBrandRankingTag(brand) : null;
              const relatedCount =
                relatedData.key === relatedKey
                  ? relatedData.counts[item.id]
                  : undefined;
              const breweryBrands =
                relatedData.key === relatedKey
                  ? relatedData.brands?.[item.id]
                  : undefined;
              const prefecture = directoryPrefecture(type, item);
              const breweryName =
                brand?.breweries?.name ||
                brand?.requested_brewery_name ||
                "酒蔵未登録";
              const href =
                type === "shop"
                  ? `/shops/${item.id}?${new URLSearchParams({ return_to: returnTo })}`
                  : masterDetailHref(type, item.id, returnTo);
              return (
                <article
                  className={`brand-item directory-item${type === "shop" ? " directory-shop-item" : ""}`}
                  key={item.id}
                >
                  {brand?.registration_status === "pending" && (
                    <span className="status-badge pending directory-pending-badge">
                      申請中
                    </span>
                  )}
                  <div className="brand-item-copy">
                    <div className="brand-item-meta">
                      {prefecture && (
                        <>
                          <button
                            type="button"
                            aria-label={`${prefecture}で絞り込む`}
                            onClick={() =>
                              updateFilters({
                                prefectures: new Set([prefecture]),
                              })
                            }
                          >
                            {prefecture}
                          </button>
                          {(brand || type === "shop") && (
                            <span aria-hidden="true">·</span>
                          )}
                        </>
                      )}
                      {brand && breweryName !== "酒蔵未登録" ? (
                        <button
                          type="button"
                          aria-label={`${breweryName}の銘柄に絞り込む`}
                          onClick={() => updateFilters({ query: breweryName })}
                        >
                          {breweryName}
                        </button>
                      ) : brand ? (
                        <span>酒蔵未登録</span>
                      ) : type === "shop" ? (
                        <span>{(item as Shop).city || "所在地未登録"}</span>
                      ) : !prefecture ? (
                        <span>所在地未登録</span>
                      ) : null}
                      {rankingTag && (
                        <span
                          className={`brand-ranking-tag is-${rankingTag.kind}-ranked`}
                          title={shopBrandRankingLabel(brand!) ?? undefined}
                        >
                          {rankingTag.label}
                        </span>
                      )}
                    </div>
                    {type === "shop" && (
                      <span className="directory-related-count">
                        取扱銘柄{" "}
                        {relatedCount !== undefined
                          ? `${relatedCount}件`
                          : relatedError
                            ? "不明"
                            : "確認中"}
                      </span>
                    )}
                    <div className="brand-item-name">
                      {brand ? (
                        <BrandInfoLink
                          brandId={item.id}
                          brandName={item.name}
                          returnTo={returnTo}
                        />
                      ) : (
                        <a className="brand-name-link" href={href}>
                          <strong>{item.name}</strong>
                        </a>
                      )}
                      {item.name_kana && (
                        <span className="brand-item-kana">
                          {item.name_kana}
                        </span>
                      )}
                      {brand && (
                        <span className="directory-related-count">
                          取扱{" "}
                          {relatedCount !== undefined
                            ? `${relatedCount}店`
                            : relatedError
                              ? "不明"
                              : "確認中"}
                        </span>
                      )}
                    </div>
                    {type === "brewery" &&
                      (breweryBrands?.length ? (
                        <ul
                          className="directory-brewery-brands"
                          aria-label={`${item.name}の銘柄`}
                        >
                          {breweryBrands.map((breweryBrand) => (
                            <li key={breweryBrand.id}>
                              <a
                                className="brand-name-link"
                                href={masterDetailHref(
                                  "brand",
                                  breweryBrand.id,
                                  returnTo,
                                )}
                              >
                                {breweryBrand.name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="directory-brewery-brands-status">
                          {breweryBrands
                            ? "登録銘柄なし"
                            : relatedError
                              ? "銘柄を取得できませんでした"
                              : "銘柄を確認中…"}
                        </p>
                      ))}
                  </div>
                </article>
              );
            })}
          </div>
          {relatedError && (
            <div className="notice error" role="alert">
              {relatedError}
              <button
                className="button small ghost"
                type="button"
                onClick={() => setRelatedRetry((value) => value + 1)}
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
