import {
  brandPrefecture,
  kanaGroup,
  kanaGroups,
  matchesBrandFilters,
  matchesBrandQuery,
  prefectures,
  sortBrands,
  type BrandCatalogSort,
  type BrandFilterTarget,
  type KanaGroup,
} from "./brand-index";
import { normalizeKanaSearchText } from "./search-text";
import type { Brand, Brewery, EntityType, Shop } from "./types";

export type DirectoryItemByType = {
  brand: Brand;
  brewery: Brewery;
  shop: Shop;
};
export type DirectoryItem = DirectoryItemByType[EntityType];
export type DirectoryFilters = {
  query: string;
  status: "all" | "pending" | "approved";
  prefectures: Set<string>;
  kana: Set<KanaGroup>;
  targets: Set<BrandFilterTarget>;
  sort: BrandCatalogSort;
  page: number;
};
export const directoryPageSize = 30;
export const directoryLabels = {
  brand: "銘柄",
  brewery: "酒蔵",
  shop: "酒屋",
} as const;
export const directoryPaths = {
  brand: "/brands",
  brewery: "/breweries",
  shop: "/shops",
} as const;

export function directoryFilters(
  params: URLSearchParams,
  type: EntityType = "brand",
): DirectoryFilters {
  const values = (key: string) => params.get(key)?.split(",") ?? [];
  const status = params.get("status");
  const sort = params.get("sort");
  const page = Number(params.get("page") ?? 1);
  return {
    query: params.get("q")?.slice(0, 150) ?? "",
    status: status === "pending" || status === "approved" ? status : "all",
    prefectures: new Set(
      values("prefectures").filter((value) =>
        prefectures.some((prefecture) => prefecture === value),
      ),
    ),
    kana: new Set(
      values("kana").filter(
        (value): value is KanaGroup =>
          value === "other" || kanaGroups.some((group) => group === value),
      ),
    ),
    targets: params.has("targets")
      ? new Set(
          values("targets").filter(
            (value): value is BrandFilterTarget =>
              value === "brand" || value === "brewery",
          ),
        )
      : new Set(["brand"]),
    sort:
      sort === "brand" ||
      sort === "brewery" ||
      sort === "region" ||
      sort === "recent" ||
      (sort === "ranking" && type === "brand")
        ? sort
        : type === "brand"
          ? "ranking"
          : "brand",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function directorySearchParams(
  filters: DirectoryFilters,
  type: EntityType = "brand",
) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.prefectures.size)
    params.set("prefectures", [...filters.prefectures].join(","));
  if (filters.kana.size) params.set("kana", [...filters.kana].join(","));
  if (filters.targets.size !== 1 || !filters.targets.has("brand"))
    params.set("targets", [...filters.targets].join(","));
  if (filters.sort !== (type === "brand" ? "ranking" : "brand"))
    params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function directoryPrefecture(type: EntityType, item: DirectoryItem) {
  return type === "brand" ? brandPrefecture(item as Brand) : item.prefecture;
}

const collator = new Intl.Collator("ja", {
  sensitivity: "base",
  numeric: true,
});
const normalize = (value: string) =>
  normalizeKanaSearchText(value.normalize("NFKC").trim().toLocaleLowerCase());

function registrationTime(type: EntityType, item: DirectoryItem) {
  const date =
    type === "brand"
      ? ((item as Brand).registered_at ?? item.created_at)
      : item.created_at;
  const time = date ? Date.parse(date) : NaN;
  return Number.isFinite(time) ? time : 0;
}

export function directoryPage(
  type: EntityType,
  items: DirectoryItem[],
  filters: DirectoryFilters,
) {
  const query = normalize(filters.query);
  const matching = items.filter((item) => {
    if (type === "brand") {
      const brand = item as Brand;
      return (
        (filters.status === "all" ||
          brand.registration_status === filters.status) &&
        matchesBrandQuery(brand, filters.query) &&
        matchesBrandFilters(
          brand,
          filters.prefectures,
          filters.targets,
          filters.kana,
        )
      );
    }
    const prefecture = directoryPrefecture(type, item);
    if (
      filters.prefectures.size &&
      (!prefecture || !filters.prefectures.has(prefecture))
    )
      return false;
    if (
      filters.kana.size &&
      !filters.kana.has(
        kanaGroup((item.name_kana?.trim() || item.name).normalize("NFKC")),
      )
    )
      return false;
    return [
      item.name,
      item.name_kana,
      ...(type === "shop" ? [(item as Shop).city] : []),
    ].some((value) => value && normalize(value).includes(query));
  });
  const sorted =
    filters.sort === "recent"
      ? [...matching].sort(
          (a, b) =>
            registrationTime(type, b) - registrationTime(type, a) ||
            collator.compare(
              a.name_kana?.trim() || a.name,
              b.name_kana?.trim() || b.name,
            ) ||
            a.id.localeCompare(b.id),
        )
      : type === "brand"
        ? sortBrands(matching as Brand[], filters.sort, filters.query)
        : [...matching].sort((a, b) => {
            if (filters.sort === "region") {
              const region = collator.compare(
                directoryPrefecture(type, a) ?? "",
                directoryPrefecture(type, b) ?? "",
              );
              if (region) return region;
            }
            return (
              collator.compare(
                a.name_kana?.trim() || a.name,
                b.name_kana?.trim() || b.name,
              ) || a.id.localeCompare(b.id)
            );
          });
  const pageCount = Math.max(1, Math.ceil(sorted.length / directoryPageSize));
  const page = Math.min(filters.page, pageCount);
  const start = (page - 1) * directoryPageSize;
  return {
    items: sorted.slice(start, start + directoryPageSize),
    count: sorted.length,
    page,
    pageCount,
    start,
  };
}
