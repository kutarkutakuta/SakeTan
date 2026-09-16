export type ShopMarkerStatus = "loading" | "registered" | "unregistered";

export function shopMarkerStatus(
  brandTotal: number | undefined,
): ShopMarkerStatus {
  if (brandTotal === undefined) return "loading";
  return brandTotal > 0 ? "registered" : "unregistered";
}

export function shopMarkerTitle(
  shopName: string,
  brandTotal: number | undefined,
) {
  if (brandTotal === undefined) return `${shopName}、取扱銘柄を確認中`;
  if (brandTotal === 0) return `${shopName}、取扱銘柄は未登録`;
  return `${shopName}、取扱銘柄${brandTotal}件`;
}
