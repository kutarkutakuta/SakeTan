import { distanceMeters, type ShopLocation } from "./shop-duplicates";
import type { Bounds } from "./types";

export function mapBoundsCenter(bounds: Bounds): [number, number] {
  const longitude =
    bounds.west <= bounds.east
      ? (bounds.west + bounds.east) / 2
      : (((bounds.west + bounds.east + 360) / 2 + 540) % 360) - 180;
  return [(bounds.south + bounds.north) / 2, longitude];
}

export function orderMapShops<T extends ShopLocation>(
  shops: T[],
  center: [number, number] | undefined,
  selectedId: string | null,
) {
  return shops
    .map((shop, index) => ({
      shop,
      index,
      distance:
        center &&
        typeof shop.latitude === "number" &&
        typeof shop.longitude === "number"
          ? distanceMeters(center[0], center[1], shop.latitude, shop.longitude)
          : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => {
      const aSelected = a.shop.id === selectedId;
      const bSelected = b.shop.id === selectedId;
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return a.distance - b.distance || a.index - b.index;
    })
    .map(({ shop }) => shop);
}

export function visibleShopList<T extends ShopLocation>(
  shops: T[],
  center: [number, number] | undefined,
  selectedId: string | null,
  limit = 20,
) {
  return orderMapShops(shops, center, selectedId).slice(0, limit);
}
