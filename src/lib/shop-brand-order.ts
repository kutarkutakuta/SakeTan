import type { Brand } from "./types";

export type ShopBrandSummary = {
  last_seen_at: string | null;
  brands: Brand;
};

export function orderedShopBrands(rows: ShopBrandSummary[]) {
  return [...rows]
    .sort((a, b) => {
      const aRank = a.brands.sakenowa_rank;
      const bRank = b.brands.sakenowa_rank;
      if (aRank != null || bRank != null)
        return (
          (aRank ?? Number.MAX_SAFE_INTEGER) -
          (bRank ?? Number.MAX_SAFE_INTEGER)
        );
      return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
    })
    .map((row) => row.brands);
}

export function featuredShopBrands(rows: ShopBrandSummary[], limit = 6) {
  return orderedShopBrands(rows).slice(0, limit);
}
