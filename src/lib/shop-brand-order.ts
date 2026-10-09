import type { Brand } from "./types";

export type ShopBrandSummary = {
  last_seen_at: string | null;
  brands: Brand;
};

export function shopBrandRankingTag(brand: Brand) {
  if (brand.sakenowa_rank != null)
    return { kind: "national" as const, label: `全国${brand.sakenowa_rank}位` };
  if (brand.sakenowa_area_rank != null && brand.sakenowa_area_rank <= 5) {
    const area =
      brand.sakenowa_area_name ?? brand.breweries?.prefecture ?? "地域";
    return {
      kind: "regional" as const,
      label: `${area.replace(/[都府県]$/u, "")}${brand.sakenowa_area_rank}位`,
    };
  }
  return null;
}

export function shopBrandRankingLabel(brand: Brand) {
  if (brand.sakenowa_rank != null)
    return `さけのわ全国${brand.sakenowa_rank}位`;
  if (brand.sakenowa_area_rank != null && brand.sakenowa_area_rank <= 5)
    return `さけのわ${brand.sakenowa_area_name ?? "地域"}${brand.sakenowa_area_rank}位`;
  return null;
}

function reading(brand: Brand) {
  return (brand.name_kana?.trim() || brand.name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/gu, (character) =>
      String.fromCodePoint(character.codePointAt(0)! - 0x60),
    );
}

export function compareShopBrands(a: Brand, b: Brand) {
  const group = (brand: Brand) =>
    brand.sakenowa_rank != null
      ? 0
      : brand.sakenowa_area_rank != null && brand.sakenowa_area_rank <= 5
        ? 1
        : 2;
  const groupOrder = group(a) - group(b);
  if (groupOrder) return groupOrder;
  if (group(a) === 0) {
    const national = a.sakenowa_rank! - b.sakenowa_rank!;
    if (national) return national;
  }
  if (group(a) < 2) {
    const regional =
      (a.sakenowa_area_rank ?? Number.MAX_SAFE_INTEGER) -
      (b.sakenowa_area_rank ?? Number.MAX_SAFE_INTEGER);
    if (regional) return regional;
  }
  const left = reading(a),
    right = reading(b);
  return left < right ? -1 : left > right ? 1 : a.id.localeCompare(b.id);
}

export function orderedShopBrands(rows: ShopBrandSummary[]) {
  return [...rows]
    .sort((a, b) => compareShopBrands(a.brands, b.brands))
    .map((row) => row.brands);
}

export function featuredShopBrands(rows: ShopBrandSummary[], limit = 6) {
  return orderedShopBrands(rows).slice(0, limit);
}
