"use client";
import { BrandInfoLink } from "./brand-info-link";
import {
  directoryPrefecture,
  type DirectoryFilters,
  type DirectoryItem,
} from "@/lib/directory-index";
import { masterDetailHref } from "@/lib/master-navigation";
import {
  shopBrandRankingLabel,
  shopBrandRankingTag,
} from "@/lib/shop-brand-order";
import type { BreweryBrand } from "@/lib/brewery-brands";
import type { Brand, EntityType, Shop } from "@/lib/types";

export function DirectoryCard({
  type,
  item,
  returnTo,
  relatedCount,
  breweryBrands,
  error,
  onFilterChange,
}: {
  type: EntityType;
  item: DirectoryItem;
  returnTo: string;
  relatedCount?: number;
  breweryBrands?: BreweryBrand[];
  error: boolean;
  onFilterChange: (patch: Partial<DirectoryFilters>) => void;
}) {
  const brand = type === "brand" ? (item as Brand) : null;
  const rankingTag = brand ? shopBrandRankingTag(brand) : null;
  const prefecture = directoryPrefecture(type, item);
  const breweryName =
    brand?.breweries?.name || brand?.requested_brewery_name || "酒蔵未登録";
  const href =
    type === "shop"
      ? `/shops/${item.id}?${new URLSearchParams({ return_to: returnTo })}`
      : masterDetailHref(type, item.id, returnTo);
  return (
    <article
      className={`brand-item directory-item${type === "shop" ? " directory-shop-item" : ""}`}
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
                  onFilterChange({
                    prefectures: new Set([prefecture]),
                  })
                }
              >
                {prefecture}
              </button>
              {(brand || type === "shop") && <span aria-hidden="true">·</span>}
            </>
          )}
          {brand && breweryName !== "酒蔵未登録" ? (
            <button
              type="button"
              aria-label={`${breweryName}の銘柄に絞り込む`}
              onClick={() => onFilterChange({ query: breweryName })}
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
              : error
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
            <span className="brand-item-kana">{item.name_kana}</span>
          )}
          {brand && (
            <span className="directory-related-count">
              取扱{" "}
              {relatedCount !== undefined
                ? `${relatedCount}店`
                : error
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
                    href={masterDetailHref("brand", breweryBrand.id, returnTo)}
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
                : error
                  ? "銘柄を取得できませんでした"
                  : "銘柄を確認中…"}
            </p>
          ))}
      </div>
    </article>
  );
}
