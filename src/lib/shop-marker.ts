export type ShopMarkerStatus = "loading" | "registered" | "unregistered";
export type ShopMarkerLevel = 1 | 2 | 3 | 4 | 5;

export function shopMarkerStatus(
  brandTotal: number | undefined,
): ShopMarkerStatus {
  if (brandTotal === undefined) return "loading";
  return brandTotal > 0 ? "registered" : "unregistered";
}

export function shopMarkerLevel(
  brandTotal: number | undefined,
): ShopMarkerLevel | undefined {
  if (brandTotal === undefined || brandTotal <= 0) return undefined;
  if (brandTotal < 20) return 1;
  if (brandTotal < 50) return 2;
  if (brandTotal < 100) return 3;
  if (brandTotal < 200) return 4;
  return 5;
}

export function shopMarkerTitle(
  shopName: string,
  brandTotal: number | undefined,
) {
  if (brandTotal === undefined) return `${shopName}、取扱銘柄を確認中`;
  if (brandTotal === 0) return `${shopName}、取扱銘柄は未登録`;
  return `${shopName}、取扱銘柄${brandTotal}件`;
}
