export function todayJapan() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}
export function safeNext(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : "/";
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}
const GOOGLE_GEOCODE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export function hasUsableCoordinates<
  T extends {
    latitude: number | null;
    longitude: number | null;
    geocode_source?: string | null;
    geocoded_at?: string | null;
  },
>(
  value: T,
  now = Date.now(),
): value is T & { latitude: number; longitude: number } {
  if (
    typeof value.latitude !== "number" ||
    typeof value.longitude !== "number" ||
    !Number.isFinite(value.latitude) ||
    !Number.isFinite(value.longitude)
  )
    return false;
  if (value.geocode_source !== "google") return true;
  if (!value.geocoded_at) return false;
  const geocodedAt = Date.parse(value.geocoded_at);
  return (
    Number.isFinite(geocodedAt) && now - geocodedAt <= GOOGLE_GEOCODE_MAX_AGE_MS
  );
}

export function googleMapsShopUrl(shop: {
  name: string;
  prefecture?: string | null;
  city?: string | null;
  google_place_id?: string | null;
}) {
  const area = [shop.prefecture, shop.city].filter(Boolean).join("");
  const query = [shop.name, area].filter(Boolean).join(",");
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  if (shop.google_place_id)
    url.searchParams.set("query_place_id", shop.google_place_id);
  return url.toString();
}
export const labels: Record<string, string> = {
  name: "名前",
  name_kana: "かな",
  prefecture: "都道府県",
  city: "市区町村",
  latitude: "緯度",
  longitude: "経度",
  google_place_id: "Google マップの店舗",
  website_url: "公式サイト",
  brewery_id: "酒蔵",
  is_active: "有効",
  first_seen_at: "最初に見つけた日",
  last_seen_at: "最後に見つけた日",
  shop_id: "酒屋",
  brand_id: "銘柄",
  status: "取扱状況",
  external_url: "さけのわURL",
};
export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  return Object.keys(labels).filter(
    (key) =>
      JSON.stringify(before?.[key] ?? null) !==
      JSON.stringify(after?.[key] ?? null),
  );
}
