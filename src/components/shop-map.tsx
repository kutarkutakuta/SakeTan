"use client";
import { useEffect, useRef, useState } from "react";
import { googleMapId, loadGoogleMaps } from "@/lib/google-maps";
import type { Bounds, Shop } from "@/lib/types";
import { hasUsableCoordinates } from "@/lib/utils";

type GoogleLibraries = Awaited<ReturnType<typeof loadGoogleMaps>>;
type MarkerInstance = {
  id: string;
  marker: google.maps.marker.AdvancedMarkerElement;
  pin: google.maps.marker.PinElement;
};

export default function ShopMap({
  shops,
  selected,
  highlighted,
  onSelect,
  onBounds,
  center,
  compact = false,
}: {
  shops: Shop[];
  selected?: string | null;
  highlighted?: string | null;
  onSelect?: (id: string) => void;
  onBounds?: (bounds: Bounds) => void;
  center?: [number, number];
  locate?: number;
  compact?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markerInstances = useRef<MarkerInstance[]>([]);
  const onBoundsRef = useRef(onBounds);
  const onSelectRef = useRef(onSelect);
  const centerRef = useRef(center);
  const compactRef = useRef(compact);
  const [libraries, setLibraries] = useState<GoogleLibraries | null>(null);
  const [error, setError] = useState("");
  onBoundsRef.current = onBounds;
  onSelectRef.current = onSelect;
  centerRef.current = center;
  compactRef.current = compact;

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
          zoom: initialCenter ? (compactRef.current ? 17 : 14) : 5,
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
    if (center && map.current) {
      map.current.moveCamera({
        center: { lat: center[0], lng: center[1] },
        zoom: compact ? 17 : 14,
      });
    }
  }, [center, compact]);

  useEffect(() => {
    if (!libraries || !map.current) return;
    markerInstances.current.forEach(({ marker }) => (marker.map = null));
    markerInstances.current = shops.filter(hasUsableCoordinates).map((shop) => {
      const pin = new libraries.marker.PinElement({
        background: "#b84a3a",
        borderColor: "#ffffff",
        glyphColor: "#ffffff",
        scale: 1,
      });
      const marker = new libraries.marker.AdvancedMarkerElement({
        map: map.current,
        position: { lat: shop.latitude, lng: shop.longitude },
        title: shop.name,
        content: pin,
        gmpClickable: Boolean(onSelectRef.current),
        zIndex: 1,
      });
      marker.addEventListener("gmp-click", () =>
        onSelectRef.current?.(shop.id),
      );
      return { id: shop.id, marker, pin };
    });
    return () => {
      markerInstances.current.forEach(({ marker }) => (marker.map = null));
      markerInstances.current = [];
    };
  }, [libraries, shops]);

  useEffect(() => {
    markerInstances.current.forEach(({ id, marker, pin }) => {
      const isSelected = id === selected;
      const isHighlighted = id === highlighted && !isSelected;
      pin.background = isSelected ? "#fff7f4" : "#b84a3a";
      pin.borderColor = isSelected
        ? "#b84a3a"
        : isHighlighted
          ? "#f0b4a9"
          : "#ffffff";
      pin.glyphColor = isSelected ? "#b84a3a" : "#ffffff";
      pin.scale = isSelected ? 1.3 : isHighlighted ? 1.15 : 1;
      marker.zIndex = isSelected ? 20 : isHighlighted ? 10 : 1;
    });
  }, [highlighted, libraries, selected, shops]);

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
