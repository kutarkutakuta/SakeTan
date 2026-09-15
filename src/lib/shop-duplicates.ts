export type ShopLocation = {
  id: string;
  latitude: number | null;
  longitude: number | null;
};

export function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearbyShops<T extends ShopLocation>(
  shops: T[],
  origin: { latitude: number; longitude: number },
  options: { excludeId?: string; radiusMeters: number; limit: number },
) {
  return shops
    .filter(
      (shop) =>
        shop.id !== options.excludeId &&
        typeof shop.latitude === "number" &&
        typeof shop.longitude === "number",
    )
    .map((shop) => ({
      ...shop,
      distance_m: Math.round(
        distanceMeters(
          origin.latitude,
          origin.longitude,
          shop.latitude as number,
          shop.longitude as number,
        ),
      ),
    }))
    .filter((shop) => shop.distance_m <= options.radiusMeters)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, options.limit);
}
