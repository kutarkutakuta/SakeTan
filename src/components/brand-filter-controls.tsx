"use client";

import { useId, useState } from "react";
import { ChevronDown, MapPin, SlidersHorizontal, X } from "lucide-react";
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

type RegistrationStatus = "all" | "approved" | "pending";

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
  showTargets = true,
  registrationFilter,
  defaultTargets = ["brand"],
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
  showTargets?: boolean;
  defaultTargets?: readonly BrandFilterTarget[];
  registrationFilter?: {
    value: RegistrationStatus;
    onChange: (value: RegistrationStatus) => void;
  };
}) {
  const [openPanel, setOpenPanel] = useState<"region" | "details" | null>(null);
  const prefectureOptionsId = useId();
  const kanaOptionsId = useId();
  const targetChanged =
    showTargets &&
    (selectedTargets.size !== defaultTargets.length ||
      defaultTargets.some((value) => !selectedTargets.has(value)));
  const statusChanged =
    registrationFilter && registrationFilter.value !== "all";
  const detailCount = selectedKana.size + Number(targetChanged);
  const hasFilters =
    selectedPrefectures.size > 0 || detailCount > 0 || Boolean(statusChanged);
  const selectedPrefectureNames = prefectures.filter((value) =>
    selectedPrefectures.has(value),
  );
  const selectedKanaNames = [
    ...kanaGroups.filter((value) => selectedKana.has(value)),
    ...(selectedKana.has("other") ? ["他"] : []),
  ];
  const targetLabel =
    (["brand", "brewery"] as const)
      .filter((value) => selectedTargets.has(value))
      .map((value) => (value === "brand" ? "銘柄" : "蔵元"))
      .join("・") || "未選択";
  return (
    <div className="brand-filter-panel">
      <div className="filter-toolbar">
        <button
          type="button"
          className={`filter-toggle${emphasizePrefectures ? " filter-attention" : ""}`}
          aria-expanded={openPanel === "region"}
          aria-controls={prefectureOptionsId}
          onClick={() => setOpenPanel(openPanel === "region" ? null : "region")}
        >
          <MapPin size={17} aria-hidden="true" />
          <span>地域を選ぶ</span>
          {selectedPrefectureNames.length > 0 && (
            <span className="filter-selection-count">
              {selectedPrefectureNames.length}
            </span>
          )}
          <ChevronDown
            size={16}
            className="filter-toggle-chevron"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          className={`filter-toggle${emphasizeKana ? " filter-attention" : ""}`}
          aria-expanded={openPanel === "details"}
          aria-controls={kanaOptionsId}
          onClick={() =>
            setOpenPanel(openPanel === "details" ? null : "details")
          }
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          <span>頭文字で選ぶ</span>
          {detailCount > 0 && (
            <span className="filter-selection-count">{detailCount}</span>
          )}
          <ChevronDown
            size={16}
            className="filter-toggle-chevron"
            aria-hidden="true"
          />
        </button>
        {registrationFilter && (
          <label className="filter-registration-status">
            <select
              aria-label="登録状態"
              value={registrationFilter.value}
              onChange={(event) =>
                registrationFilter.onChange(
                  event.target.value as RegistrationStatus,
                )
              }
            >
              <option value="all">登録状態：すべて</option>
              <option value="approved">登録済み</option>
              <option value="pending">申請中</option>
            </select>
          </label>
        )}
        <label className="sort-select">
          <select
            aria-label="並び順"
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
      <div
        id={prefectureOptionsId}
        className="filter-options"
        hidden={openPanel !== "region"}
      >
        <div className="filter-options-heading">
          <span className="filter-options-label">都道府県</span>
          <span>複数選択できます</span>
        </div>
        <div
          className={`filter-links filter-region-options${emphasizePrefectures ? " filter-attention" : ""}`}
          role="group"
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
      </div>
      <div
        id={kanaOptionsId}
        className="filter-options filter-detail-options"
        hidden={openPanel !== "details"}
      >
        {showTargets && (
          <div>
            <p className="filter-options-label">かなの対象</p>
            <div className="filter-links" role="group" aria-label="かなの対象">
              {(["brand", "brewery"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={selectedTargets.has(value)}
                  onClick={() =>
                    onTargetsChange(toggleValue(selectedTargets, value))
                  }
                >
                  {value === "brand" ? "銘柄" : "蔵元"}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="filter-options-label">頭文字</p>
          <div
            className={`filter-links kana-links${emphasizeKana ? " filter-attention" : ""}`}
            role="group"
            aria-label="頭文字で絞り込む"
          >
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
        </div>
      </div>
      {hasFilters && (
        <div className="filter-selected" aria-label="選択中の絞り込み条件">
          {selectedPrefectureNames.map((value) => (
            <button
              type="button"
              className="filter-selected-chip"
              key={value}
              aria-label={`${value}の絞り込みを解除`}
              onClick={() =>
                onPrefecturesChange(toggleValue(selectedPrefectures, value))
              }
            >
              {shortPrefecture(value)}
              <X size={14} aria-hidden="true" />
            </button>
          ))}
          {selectedKanaNames.map((value) => (
            <button
              type="button"
              className="filter-selected-chip"
              key={value}
              aria-label={`かな「${value}」の絞り込みを解除`}
              onClick={() =>
                onKanaChange(
                  toggleValue(
                    selectedKana,
                    value === "他" ? "other" : (value as KanaGroup),
                  ),
                )
              }
            >
              かな：{value}
              <X size={14} aria-hidden="true" />
            </button>
          ))}
          {targetChanged && (
            <button
              type="button"
              className="filter-selected-chip"
              aria-label="かなの対象を初期状態に戻す"
              onClick={() => onTargetsChange(new Set(defaultTargets))}
            >
              対象：{targetLabel}
              <X size={14} aria-hidden="true" />
            </button>
          )}
          {statusChanged && registrationFilter && (
            <button
              type="button"
              className="filter-selected-chip"
              aria-label="登録状態の絞り込みを解除"
              onClick={() => registrationFilter.onChange("all")}
            >
              {registrationFilter.value === "pending" ? "申請中" : "登録済み"}
              <X size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="clear-filters"
            onClick={() => {
              onPrefecturesChange(new Set());
              onKanaChange(new Set());
              if (showTargets) onTargetsChange(new Set(defaultTargets));
              registrationFilter?.onChange("all");
            }}
          >
            すべて解除
          </button>
        </div>
      )}
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
