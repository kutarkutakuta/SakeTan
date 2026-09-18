"use client";

import { useId, useState } from "react";
import {
  kanaGroups,
  prefectures,
  type BrandCatalogSort,
  type BrandFilterTarget,
  type KanaGroup,
} from "@/lib/brand-index";

const defaultSortOptions: Array<[BrandCatalogSort, string]> = [
  ["brand", "銘柄順"],
  ["brewery", "蔵元順"],
  ["region", "県順"],
  ["recent", "最近追加順"],
];

function toggleValue<T>(current: ReadonlySet<T>, value: T) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function shortPrefecture(value: string) {
  return value === "北海道" ? value : value.replace(/[都府県]$/, "");
}

export function BrandFilterControls({
  selectedPrefectures,
  onPrefecturesChange,
  selectedTargets,
  onTargetsChange,
  selectedKana,
  onKanaChange,
  sort,
  onSortChange,
  sortOptions = defaultSortOptions,
  emphasizePrefectures = false,
  emphasizeKana = false,
}: {
  selectedPrefectures: ReadonlySet<string>;
  onPrefecturesChange: (value: Set<string>) => void;
  selectedTargets: ReadonlySet<BrandFilterTarget>;
  onTargetsChange: (value: Set<BrandFilterTarget>) => void;
  selectedKana: ReadonlySet<KanaGroup>;
  onKanaChange: (value: Set<KanaGroup>) => void;
  sort: BrandCatalogSort;
  onSortChange: (value: BrandCatalogSort) => void;
  sortOptions?: Array<[BrandCatalogSort, string]>;
  emphasizePrefectures?: boolean;
  emphasizeKana?: boolean;
}) {
  const [prefecturesOpen, setPrefecturesOpen] = useState(false);
  const prefectureOptionsId = useId();
  const hasFilters = selectedPrefectures.size > 0 || selectedKana.size > 0;
  const selectedPrefectureNames = prefectures.filter((value) =>
    selectedPrefectures.has(value),
  );
  const prefectureSummary =
    selectedPrefectureNames.length === 0
      ? "すべて"
      : selectedPrefectureNames.length <= 2
        ? selectedPrefectureNames.map(shortPrefecture).join("・")
        : `${selectedPrefectureNames
            .slice(0, 2)
            .map(shortPrefecture)
            .join("・")}ほか${selectedPrefectureNames.length - 2}`;
  return (
    <div className="brand-filter-panel">
      <button
        type="button"
        className={`prefecture-filter-toggle${emphasizePrefectures ? " filter-attention" : ""}`}
        aria-expanded={prefecturesOpen}
        aria-controls={prefectureOptionsId}
        aria-label={`都道府県フィルター、${
          selectedPrefectureNames.join("、") || "すべて"
        }、${prefecturesOpen ? "閉じる" : "開く"}`}
        onClick={() => setPrefecturesOpen((open) => !open)}
      >
        <span>都道府県</span>
        <span className="prefecture-filter-selection">{prefectureSummary}</span>
        <span className="prefecture-filter-action">
          {prefecturesOpen
            ? "閉じる"
            : selectedPrefectureNames.length
              ? "変更"
              : "選ぶ"}
        </span>
      </button>
      <div
        id={prefectureOptionsId}
        className={`filter-links prefecture-links${prefecturesOpen ? " open" : ""}${emphasizePrefectures ? " filter-attention" : ""}`}
        aria-label="県で絞り込む"
      >
        {prefectures.map((value) => (
          <button
            type="button"
            key={value}
            aria-label={value}
            aria-pressed={selectedPrefectures.has(value)}
            onClick={() =>
              onPrefecturesChange(toggleValue(selectedPrefectures, value))
            }
          >
            {shortPrefecture(value)}
          </button>
        ))}
      </div>
      <div
        className={`filter-links combined-filter-links kana-links${emphasizeKana ? " filter-attention" : ""}`}
        aria-label="銘柄・蔵元と頭文字で絞り込む"
      >
        {(["brand", "brewery"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={selectedTargets.has(value)}
            onClick={() => onTargetsChange(toggleValue(selectedTargets, value))}
          >
            {value === "brand" ? "銘柄" : "蔵元"}
          </button>
        ))}
        {kanaGroups.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={selectedKana.has(value)}
            onClick={() => onKanaChange(toggleValue(selectedKana, value))}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={selectedKana.has("other")}
          onClick={() => onKanaChange(toggleValue(selectedKana, "other"))}
        >
          他
        </button>
      </div>
      <div className="filter-summary">
        <div className="filter-summary-actions">
          {hasFilters && (
            <button
              type="button"
              className="clear-filters"
              onClick={() => {
                onPrefecturesChange(new Set());
                onKanaChange(new Set());
              }}
            >
              絞り込みを解除
            </button>
          )}
          <label className="sort-select">
            <span>並び順</span>
            <select
              value={sort}
              onChange={(event) =>
                onSortChange(event.target.value as BrandCatalogSort)
              }
            >
              {sortOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

export function BrandFilterCount({
  visibleCount,
  totalCount,
}: {
  visibleCount: number;
  totalCount: number;
}) {
  return (
    <span className="brand-filter-count" aria-live="polite">
      {visibleCount}件表示 <span className="muted">/ {totalCount}件</span>
    </span>
  );
}
