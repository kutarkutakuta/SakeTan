export type MapView = {
  center: [number, number];
  zoom: number;
};

type MapSearchParams = {
  map_lat?: string;
  map_lng?: string;
  map_zoom?: string;
};

export function parseMapView(params: MapSearchParams): MapView | undefined {
  const latitude = Number(params.map_lat);
  const longitude = Number(params.map_lng);
  const zoom = Number(params.map_zoom);

  if (
    !params.map_lat ||
    !params.map_lng ||
    !params.map_zoom ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(zoom) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    zoom < 0 ||
    zoom > 25
  )
    return undefined;

  return { center: [latitude, longitude], zoom };
}

export function mapReturnPath({
  brandId,
  shopId,
  view,
}: {
  brandId?: string;
  shopId: string;
  view?: MapView;
}) {
  const params = new URLSearchParams({ shop_id: shopId });
  if (brandId) params.set("brand_id", brandId);
  if (view) {
    params.set("map_lat", formatCoordinate(view.center[0]));
    params.set("map_lng", formatCoordinate(view.center[1]));
    params.set("map_zoom", formatZoom(view.zoom));
  }
  return `/?${params.toString()}`;
}

export function mapAwareShopPath(shopId: string, returnPath: string) {
  const params = new URLSearchParams({ return_to: returnPath });
  return `/shops/${encodeURIComponent(shopId)}?${params.toString()}`;
}

export function safeMapReturnPath(value: string | undefined, shopId: string) {
  const fallback = mapReturnPath({ shopId });
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;

  const url = new URL(value, "https://saketan.local");
  if (url.origin !== "https://saketan.local" || url.pathname !== "/")
    return fallback;

  return `${url.pathname}${url.search}`;
}

function formatCoordinate(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function formatZoom(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}
