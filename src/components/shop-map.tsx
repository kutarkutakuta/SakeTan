"use client";
import { useEffect, useRef, useState } from "react";
import { googleMapId, loadGoogleMaps } from "@/lib/google-maps";
import type { Bounds, Shop } from "@/lib/types";
import { hasUsableCoordinates } from "@/lib/utils";
import type { MapView } from "@/lib/map-view";
import {
  shopMarkerLevel,
  shopMarkerStatus,
  shopMarkerTitle,
  type ShopMarkerStatus,
} from "@/lib/shop-marker";

type GoogleLibraries = Awaited<ReturnType<typeof loadGoogleMaps>>;
type MarkerInstance = {
  id: string;
  marker: google.maps.marker.AdvancedMarkerElement;
  shopContent: HTMLDivElement;
  latitude: number;
  longitude: number;
};

const svgNamespace = "http://www.w3.org/2000/svg";

function updateShopMarker(
  content: HTMLDivElement,
  status: ShopMarkerStatus,
  brandTotal: number | undefined,
) {
  for (const value of ["loading", "registered", "unregistered"])
    content.classList.toggle(`shop-map-marker-${value}`, value === status);
  const level = shopMarkerLevel(brandTotal);
  for (let value = 1; value <= 5; value++)
    content.classList.toggle(`shop-map-marker-level-${value}`, value === level);
}

function createShopMarker(
  status: ShopMarkerStatus,
  brandTotal: number | undefined,
  name: string,
  href: string,
) {
  const content = document.createElement("div");
  content.className = "shop-map-marker";
  updateShopMarker(content, status, brandTotal);

  const icon = document.createElementNS(svgNamespace, "svg");
  icon.setAttribute("viewBox", "0 0 38 56");
  icon.setAttribute("width", "38");
  icon.setAttribute("height", "56");
  icon.setAttribute("aria-hidden", "true");

  const pin = document.createElementNS(svgNamespace, "path");
  pin.setAttribute("class", "shop-map-marker-pin");
  pin.setAttribute(
    "d",
    "M19 54C16 49 2 35 2 21a17 17 0 0 1 34 0c0 14-14 28-17 33Z",
  );

  const diamond = document.createElementNS(svgNamespace, "path");
  diamond.setAttribute("class", "shop-map-marker-diamond");
  diamond.setAttribute("fill-rule", "evenodd");
  diamond.setAttribute("d", "M19 11 30 21 19 31 8 21Zm0 3-9 7 9 7 9-7Z");

  const label = document.createElement("a");
  label.className = "shop-map-marker-label";
  label.href = href;
  label.textContent = name;
  const labelWrap = document.createElement("div");
  labelWrap.className = "shop-map-marker-label-wrap";
  labelWrap.append(label);

  icon.append(pin, diamond);
  content.append(icon, labelWrap);
  return content;
}

export default function ShopMap({
  shops,
  brandTotals,
  selected,
  highlighted,
  onSelect,
  shopHref,
  onShopNavigate,
  onBounds,
  onViewChange,
  center,
  initialZoom,
  preserveZoom = false,
  mobileSelectionOffsetY = 0,
  compact = false,
}: {
  shops: Shop[];
  brandTotals?: Record<string, number>;
  selected?: string | null;
  highlighted?: string | null;
  onSelect?: (id: string) => void;
  shopHref: (id: string) => string;
  onShopNavigate?: (id: string) => void;
  onBounds?: (bounds: Bounds) => void;
  onViewChange?: (view: MapView) => void;
  center?: [number, number];
  initialZoom?: number;
  preserveZoom?: boolean;
  mobileSelectionOffsetY?: number;
  locate?: number;
  compact?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markerInstances = useRef<MarkerInstance[]>([]);
  const onBoundsRef = useRef(onBounds);
  const onSelectRef = useRef(onSelect);
  const onShopNavigateRef = useRef(onShopNavigate);
  const onViewChangeRef = useRef(onViewChange);
  const centerRef = useRef(center);
  const initialZoomRef = useRef(initialZoom);
  const selectedRef = useRef(selected);
  const compactRef = useRef(compact);
  const shopsRef = useRef(shops);
  const [libraries, setLibraries] = useState<GoogleLibraries | null>(null);
  const [error, setError] = useState("");
  onBoundsRef.current = onBounds;
  onSelectRef.current = onSelect;
  onShopNavigateRef.current = onShopNavigate;
  onViewChangeRef.current = onViewChange;
  centerRef.current = center;
  selectedRef.current = selected;
  compactRef.current = compact;
  shopsRef.current = shops;

  useEffect(() => {
    let cancelled = false;
    let idleListener: google.maps.MapsEventListener | undefined;
    void loadGoogleMaps()
      .then((loaded) => {
        if (cancelled || !element.current) return;
        const initialCenter = centerRef.current;
        const instance = new loaded.maps.Map(element.current, {
          center: initialCenter
            ? { lat: initialCenter[0], lng: initialCenter[1] }
            : { lat: 36.3, lng: 138.4 },
          zoom:
            initialZoomRef.current ??
            (initialCenter ? (compactRef.current ? 17 : 14) : 5),
          mapId: googleMapId(),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        map.current = instance;
        setLibraries(loaded);
        idleListener = instance.addListener("idle", () => {
          const bounds = instance.getBounds();
          if (!bounds) return;
          const northEast = bounds.getNorthEast();
          const southWest = bounds.getSouthWest();
          onBoundsRef.current?.({
            south: southWest.lat(),
            north: northEast.lat(),
            west: southWest.lng(),
            east: northEast.lng(),
          });
          const center = instance.getCenter();
          const zoom = instance.getZoom();
          if (center && typeof zoom === "number")
            onViewChangeRef.current?.({
              center: [center.lat(), center.lng()],
              zoom,
            });
        });
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Google Mapsを読み込めませんでした",
        ),
      );
    return () => {
      cancelled = true;
      idleListener?.remove();
      markerInstances.current.forEach(({ marker }) => (marker.map = null));
      markerInstances.current = [];
      map.current = null;
    };
  }, []);

  useEffect(() => {
    let animationFrame: number | undefined;
    if (center && map.current) {
      const selectedShop = shopsRef.current.find(
        (shop) => shop.id === selectedRef.current,
      );
      const isSelectedShopCenter = Boolean(
        selectedShop &&
        hasUsableCoordinates(selectedShop) &&
        Math.abs(selectedShop.latitude - center[0]) < 0.000001 &&
        Math.abs(selectedShop.longitude - center[1]) < 0.000001,
      );
      map.current.moveCamera({
        center: { lat: center[0], lng: center[1] },
        ...(preserveZoom && isSelectedShopCenter
          ? {}
          : { zoom: compact ? 17 : 14 }),
      });
      const shouldOffsetSelectedShop =
        mobileSelectionOffsetY > 0 &&
        isSelectedShopCenter &&
        window.matchMedia("(max-width: 800px)").matches;
      if (shouldOffsetSelectedShop) {
        animationFrame = window.requestAnimationFrame(() =>
          map.current?.panBy(0, mobileSelectionOffsetY),
        );
      }
    }
    return () => {
      if (animationFrame !== undefined)
        window.cancelAnimationFrame(animationFrame);
    };
  }, [center, compact, mobileSelectionOffsetY, preserveZoom]);

  useEffect(() => {
    if (!libraries || !map.current) return;
    const previous = new Map(
      markerInstances.current.map((instance) => [instance.id, instance]),
    );
    const next: MarkerInstance[] = [];
    for (const shop of shops.filter(hasUsableCoordinates)) {
      const brandTotal = brandTotals?.[shop.id];
      const existing = previous.get(shop.id);
      if (existing) {
        previous.delete(shop.id);
        updateShopMarker(
          existing.shopContent,
          shopMarkerStatus(brandTotal),
          brandTotal,
        );
        const title = shopMarkerTitle(shop.name, brandTotal);
        if (existing.marker.title !== title) existing.marker.title = title;
        const label = existing.shopContent.querySelector<HTMLAnchorElement>(
          ".shop-map-marker-label",
        );
        if (label) {
          if (label.textContent !== shop.name) label.textContent = shop.name;
          const href = shopHref(shop.id);
          if (label.getAttribute("href") !== href) label.href = href;
        }
        if (
          existing.latitude !== shop.latitude ||
          existing.longitude !== shop.longitude
        ) {
          existing.marker.position = {
            lat: shop.latitude,
            lng: shop.longitude,
          };
          existing.latitude = shop.latitude;
          existing.longitude = shop.longitude;
        }
        next.push(existing);
        continue;
      }
      const shopContent = createShopMarker(
        shopMarkerStatus(brandTotal),
        brandTotal,
        shop.name,
        shopHref(shop.id),
      );
      const label = shopContent.querySelector<HTMLAnchorElement>(
        ".shop-map-marker-label",
      );
      label?.addEventListener("pointerdown", (event) =>
        event.stopPropagation(),
      );
      label?.addEventListener("click", (event) => {
        event.stopPropagation();
        onShopNavigateRef.current?.(shop.id);
      });
      const marker = new libraries.marker.AdvancedMarkerElement({
        map: map.current,
        position: { lat: shop.latitude, lng: shop.longitude },
        title: shopMarkerTitle(shop.name, brandTotal),
        content: shopContent,
        gmpClickable: Boolean(onSelectRef.current),
        zIndex: 1,
      });
      marker.addEventListener("gmp-click", () =>
        onSelectRef.current?.(shop.id),
      );
      next.push({
        id: shop.id,
        marker,
        shopContent,
        latitude: shop.latitude,
        longitude: shop.longitude,
      });
    }
    previous.forEach(({ marker }) => (marker.map = null));
    markerInstances.current = next;
  }, [brandTotals, libraries, shopHref, shops]);

  useEffect(() => {
    markerInstances.current.forEach(({ id, marker, shopContent }) => {
      const isSelected = id === selected;
      const isHighlighted = id === highlighted && !isSelected;
      shopContent.classList.toggle("is-highlighted", isHighlighted);
      shopContent.classList.toggle("is-selected", isSelected);
      marker.zIndex = isSelected ? 20 : isHighlighted ? 10 : 1;
    });
  }, [brandTotals, highlighted, libraries, selected, shops]);

  if (error)
    return (
      <div className="map map-loading" role="alert">
        {error}
      </div>
    );
  return (
    <div
      ref={element}
      className={compact ? "map compact-map google-map" : "map google-map"}
      aria-label="酒屋のGoogleマップ"
    />
  );
}
