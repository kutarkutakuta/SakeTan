"use client";
import { useEffect, useRef, useState } from "react";
import { googleMapId, loadGoogleMaps } from "@/lib/google-maps";
import type { Bounds, Shop } from "@/lib/types";
import { hasUsableCoordinates } from "@/lib/utils";
import type { MapView } from "@/lib/map-view";
import {
  shopMarkerStatus,
  shopMarkerTitle,
  type ShopMarkerStatus,
} from "@/lib/shop-marker";

type GoogleLibraries = Awaited<ReturnType<typeof loadGoogleMaps>>;
type MarkerInstance = {
  id: string;
  marker: google.maps.marker.AdvancedMarkerElement;
  shopContent: HTMLDivElement;
  selectedPin: google.maps.marker.PinElement;
};

const svgNamespace = "http://www.w3.org/2000/svg";
const storeIconPaths = [
  "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5",
  "M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244",
  "M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
];
const selectedStoreGlyph = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="${svgNamespace}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${storeIconPaths
    .map((pathData) => `<path d="${pathData}"/>`)
    .join("")}</svg>`,
)}`;

function createStoreMarker(status: ShopMarkerStatus) {
  const content = document.createElement("div");
  content.className = `shop-map-marker shop-map-marker-${status}`;
  content.setAttribute("aria-hidden", "true");

  const icon = document.createElementNS(svgNamespace, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "21");
  icon.setAttribute("height", "21");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");

  storeIconPaths.forEach((pathData) => {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", pathData);
    icon.append(path);
  });

  content.append(icon);
  return content;
}

export default function ShopMap({
  shops,
  brandTotals,
  selected,
  highlighted,
  onSelect,
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
    markerInstances.current.forEach(({ marker }) => (marker.map = null));
    markerInstances.current = shops.filter(hasUsableCoordinates).map((shop) => {
      const brandTotal = brandTotals?.[shop.id];
      const shopContent = createStoreMarker(shopMarkerStatus(brandTotal));
      const selectedPin = new libraries.marker.PinElement({
        background: "#b84a3a",
        borderColor: "#ffffff",
        glyphSrc: selectedStoreGlyph,
        scale: 1.55,
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
      return { id: shop.id, marker, shopContent, selectedPin };
    });
    return () => {
      markerInstances.current.forEach(({ marker }) => (marker.map = null));
      markerInstances.current = [];
    };
  }, [brandTotals, libraries, shops]);

  useEffect(() => {
    markerInstances.current.forEach(
      ({ id, marker, selectedPin, shopContent }) => {
        const isSelected = id === selected;
        const isHighlighted = id === highlighted && !isSelected;
        shopContent.classList.toggle("is-highlighted", isHighlighted);
        marker.content = isSelected ? selectedPin : shopContent;
        marker.zIndex = isSelected ? 20 : isHighlighted ? 10 : 1;
      },
    );
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
