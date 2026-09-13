"use client";
import { useEffect, useRef, useState } from "react";
import { googleMapId, loadGoogleMaps } from "@/lib/google-maps";
import type { Bounds, Shop } from "@/lib/types";
import { hasUsableCoordinates } from "@/lib/utils";

type GoogleLibraries = Awaited<ReturnType<typeof loadGoogleMaps>>;

export default function ShopMap({
  shops,
  selected,
  onSelect,
  onBounds,
  center,
  compact = false,
}: {
  shops: Shop[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onBounds?: (bounds: Bounds) => void;
  center?: [number, number];
  locate?: number;
  compact?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markerInstances = useRef<google.maps.marker.AdvancedMarkerElement[]>(
    [],
  );
  const onBoundsRef = useRef(onBounds);
  const onSelectRef = useRef(onSelect);
  const [libraries, setLibraries] = useState<GoogleLibraries | null>(null);
  const [error, setError] = useState("");
  onBoundsRef.current = onBounds;
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    let idleListener: google.maps.MapsEventListener | undefined;
    void loadGoogleMaps()
      .then((loaded) => {
        if (cancelled || !element.current) return;
        const instance = new loaded.maps.Map(element.current, {
          center: center
            ? { lat: center[0], lng: center[1] }
            : { lat: 36.3, lng: 138.4 },
          zoom: center ? 14 : 5,
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
      markerInstances.current.forEach((marker) => (marker.map = null));
      markerInstances.current = [];
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (center && map.current) {
      map.current.setCenter({ lat: center[0], lng: center[1] });
      map.current.setZoom(compact ? 17 : 14);
    }
  }, [center, compact]);

  useEffect(() => {
    if (!libraries || !map.current) return;
    markerInstances.current.forEach((marker) => (marker.map = null));
    markerInstances.current = shops.filter(hasUsableCoordinates).map((shop) => {
      const active = shop.id === selected;
      const pin = new libraries.marker.PinElement({
        background: active ? "#252522" : "#b84a3a",
        borderColor: "#ffffff",
        glyphColor: "#ffffff",
        scale: active ? 1.25 : 1,
      });
      const marker = new libraries.marker.AdvancedMarkerElement({
        map: map.current,
        position: { lat: shop.latitude, lng: shop.longitude },
        title: shop.name,
        content: pin,
        gmpClickable: Boolean(onSelectRef.current),
        zIndex: active ? 10 : 1,
      });
      marker.addEventListener("gmp-click", () =>
        onSelectRef.current?.(shop.id),
      );
      return marker;
    });
    return () => {
      markerInstances.current.forEach((marker) => (marker.map = null));
      markerInstances.current = [];
    };
  }, [libraries, selected, shops]);

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
