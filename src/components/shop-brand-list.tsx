"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  matchesBrandFilters,
  matchesBrandQuery,
  sortShopBrands,
  type BrandCatalogSort,
  type BrandFilterTarget,
  type KanaGroup,
  type ShopBrandSummary,
} from "@/lib/brand-index";
import { BrandFilterControls, BrandFilterCount } from "./brand-filter-controls";

export function ShopBrandList({
  description,
  items,
  title,
}: {
  description?: string;
  items: ShopBrandSummary[];
  title: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedPrefectures, setSelectedPrefectures] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTargets, setSelectedTargets] = useState<
    Set<BrandFilterTarget>
  >(() => new Set(["brand", "brewery"]));
  const [selectedKana, setSelectedKana] = useState<Set<KanaGroup>>(new Set());
  const [sort, setSort] = useState<BrandCatalogSort>("brand");
  const visible = useMemo(
    () =>
      sortShopBrands(
        items.filter(
          (item) =>
            matchesBrandQuery(item.brands, query) &&
            matchesBrandFilters(
              item.brands,
              selectedPrefectures,
              selectedTargets,
              selectedKana,
            ),
        ),
        sort,
      ),
    [items, query, selectedKana, selectedPrefectures, selectedTargets, sort],
  );

  return (
    <>
      <div className="shop-brands-heading">
        <h2>{title}</h2>
        <BrandFilterCount
          visibleCount={visible.length}
          totalCount={items.length}
        />
      </div>
      {description && <p className="hint availability-note">{description}</p>}
      <label className="searchbox brand-list-search">
        <Search size={19} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="取扱銘柄・蔵元を検索"
          aria-label="取扱銘柄・蔵元を検索"
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
      <BrandFilterControls
        selectedPrefectures={selectedPrefectures}
        onPrefecturesChange={setSelectedPrefectures}
        selectedTargets={selectedTargets}
        onTargetsChange={setSelectedTargets}
        selectedKana={selectedKana}
        onKanaChange={setSelectedKana}
        sort={sort}
        onSortChange={setSort}
      />
      <div className="brand-list" aria-live="polite">
        {visible.map((relation) => {
          const brand = relation.brands;
          const brewery = brand.breweries;
          const prefecture = brewery?.prefecture;
          const unavailable = relation.status === "unavailable";
          return (
            <div
              className={`brand-item${unavailable ? " is-unavailable" : ""}`}
              key={relation.id}
            >
              <span className="brand-item-copy">
                <span className="brand-item-meta">
                  {prefecture && (
                    <>
                      <button
                        type="button"
                        aria-label={`${prefecture}で絞り込む`}
                        onClick={() =>
                          setSelectedPrefectures(new Set([prefecture]))
                        }
                      >
                        {prefecture}
                      </button>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  {brewery?.name ? (
                    <button
                      type="button"
                      aria-label={`${brewery.name}の銘柄に絞り込む`}
                      onClick={() => setQuery(brewery.name)}
                    >
                      {brewery.name}
                    </button>
                  ) : (
                    <span>酒蔵未登録</span>
                  )}
                </span>
                <span className="brand-item-name">
                  {unavailable && (
                    <span className="sr-only">現在は取扱なし：</span>
                  )}
                  <strong>{brand.name}</strong>
                  {brand.name_kana && (
                    <span className="brand-item-kana">{brand.name_kana}</span>
                  )}
                </span>
              </span>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="brand-status">条件に合う取扱銘柄がありません</p>
        )}
      </div>
    </>
  );
}
