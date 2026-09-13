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
import { BrandFilterControls } from "./brand-filter-controls";

export function ShopBrandList({ items }: { items: ShopBrandSummary[] }) {
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
        visibleCount={visible.length}
        totalCount={items.length}
      />
      <div className="brand-list" aria-live="polite">
        {visible.map((relation) => {
          const brand = relation.brands;
          const brewery = brand.breweries;
          return (
            <div className="brand-item" key={relation.id}>
              <span className="brand-item-copy">
                <small>
                  {brewery?.prefecture && `${brewery.prefecture} · `}
                  {brewery?.name ?? "酒蔵未登録"}
                </small>
                <strong>{brand.name}</strong>
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
