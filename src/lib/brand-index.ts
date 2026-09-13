import type { Brand, ShopBrand } from "./types";

export const prefectures = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

export const kanaGroups = [
  "あ",
  "か",
  "さ",
  "た",
  "な",
  "は",
  "ま",
  "や",
  "ら",
  "わ",
] as const;

export type KanaGroup = (typeof kanaGroups)[number] | "other";
export type BrandFilterTarget = "brand" | "brewery";
export type BrandCatalogSort = "brand" | "brewery" | "region" | "recent";
export type ShopBrandSummary = ShopBrand;

const collator = new Intl.Collator("ja", {
  sensitivity: "base",
  numeric: true,
});

const rows: Record<(typeof kanaGroups)[number], string> = {
  あ: "あいうえおぁぃぅぇぉ",
  か: "かきくけこがぎぐげご",
  さ: "さしすせそざじずぜぞ",
  た: "たちつてとだぢづでどっ",
  な: "なにぬねの",
  は: "はひふへほばびぶべぼぱぴぷぺぽ",
  ま: "まみむめも",
  や: "やゆよゃゅょ",
  ら: "らりるれろ",
  わ: "わをんゎ",
};

function hiragana(character: string) {
  const code = character.codePointAt(0);
  if (code != null && code >= 0x30a1 && code <= 0x30f6)
    return String.fromCodePoint(code - 0x60);
  return character;
}

export function kanaGroup(value: string | null | undefined): KanaGroup {
  const first = hiragana(value?.trim().charAt(0) ?? "");
  return kanaGroups.find((group) => rows[group].includes(first)) ?? "other";
}

export function brandReading(brand: Brand) {
  return brand.name_kana?.trim() || brand.name;
}

export function breweryReading(brand: Brand) {
  return (
    brand.breweries?.name_kana?.trim() ||
    brand.breweries?.name ||
    brand.brewery_name ||
    "酒蔵未登録"
  );
}

export function brandPrefecture(brand: Brand) {
  return brand.breweries?.prefecture ?? brand.prefecture ?? null;
}

export function matchesBrandFilters(
  brand: Brand,
  selectedPrefectures: ReadonlySet<string>,
  selectedTargets: ReadonlySet<BrandFilterTarget>,
  selectedKana: ReadonlySet<KanaGroup>,
) {
  const prefecture = brandPrefecture(brand);
  if (
    selectedPrefectures.size > 0 &&
    (!prefecture || !selectedPrefectures.has(prefecture))
  )
    return false;
  if (selectedKana.size === 0) return true;

  const targets = selectedTargets.size
    ? selectedTargets
    : new Set<BrandFilterTarget>(["brand", "brewery"]);
  return (
    (targets.has("brand") &&
      selectedKana.has(kanaGroup(brandReading(brand)))) ||
    (targets.has("brewery") &&
      selectedKana.has(kanaGroup(breweryReading(brand))))
  );
}

export function matchesBrandQuery(brand: Brand, query: string) {
  const normalized = query.trim().normalize("NFKC").toLocaleLowerCase();
  if (!normalized) return true;
  return [
    brand.name,
    brand.name_kana,
    brand.breweries?.name,
    brand.breweries?.name_kana,
    brand.brewery_name,
  ].some((value) =>
    value?.normalize("NFKC").toLocaleLowerCase().includes(normalized),
  );
}

export function compareBrands(
  a: Brand,
  b: Brand,
  by: Exclude<BrandCatalogSort, "recent">,
) {
  if (by === "region") {
    const region = collator.compare(
      brandPrefecture(a) ?? "",
      brandPrefecture(b) ?? "",
    );
    if (region) return region;
  }
  if (by === "brewery") {
    const brewery = collator.compare(breweryReading(a), breweryReading(b));
    if (brewery) return brewery;
  }
  return collator.compare(brandReading(a), brandReading(b));
}

export function sortBrands(
  brands: Brand[],
  by: Exclude<BrandCatalogSort, "recent">,
) {
  return [...brands].sort((a, b) => compareBrands(a, b, by));
}

export function sortShopBrands(
  items: ShopBrandSummary[],
  by: BrandCatalogSort,
) {
  return [...items].sort((a, b) => {
    if (by === "recent") {
      const recent = (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
      if (recent) return recent;
      return compareBrands(a.brands, b.brands, "brand");
    }
    return compareBrands(a.brands, b.brands, by);
  });
}
