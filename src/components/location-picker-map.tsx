"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  googleMapId,
  loadGoogleMaps,
  loadGooglePlaces,
} from "@/lib/google-maps";

type Position = { latitude: number; longitude: number };
type PlaceSelection = Position & {
  googlePlaceId: string;
  label: string;
  name: string;
  prefecture: string | null;
  city: string | null;
};

function component(
  items: google.maps.places.AddressComponent[] | undefined,
  types: string[],
) {
  for (const type of types) {
    const value = items?.find((item) => item.types.includes(type))?.longText;
    if (value) return value;
  }
  return null;
}

function municipality(
  items: google.maps.places.AddressComponent[] | undefined,
) {
  const locality = component(items, ["locality"]);
  const sublocality = component(items, ["sublocality_level_1"]);

  // 政令指定都市では「市」と「区」が別々のコンポーネントで返る。
  // 東京23区など locality 自体が区の場合、下位の町名は結合しない。
  if (
    locality?.endsWith("市") &&
    sublocality?.endsWith("区") &&
    !locality.endsWith(sublocality)
  ) {
    return `${locality}${sublocality}`;
  }

  return (
    locality ??
    component(items, ["administrative_area_level_2", "postal_town"]) ??
    (sublocality?.endsWith("区") ? sublocality : null)
  );
}

export default function LocationPickerMap({
  position,
  onChange,
  onPlaceSelect,
  children,
}: {
  position: Position | null;
  onChange: (position: Position) => void;
  onPlaceSelect: (place: PlaceSelection) => void;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const searchElement = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const [libraries, setLibraries] = useState<Awaited<
    ReturnType<typeof loadGoogleMaps>
  > | null>(null);
  const [error, setError] = useState("");
  onChangeRef.current = onChange;
  onPlaceSelectRef.current = onPlaceSelect;

  useEffect(() => {
    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | undefined;
    let autocomplete: google.maps.places.PlaceAutocompleteElement | undefined;
    let handleSelect:
      | ((event: google.maps.places.PlacePredictionSelectEvent) => void)
      | undefined;

    void loadGoogleMaps()
      .then((loaded) => {
        if (cancelled || !element.current) return;
        const instance = new loaded.maps.Map(element.current, {
          center: position
            ? { lat: position.latitude, lng: position.longitude }
            : { lat: 36.3, lng: 138.4 },
          zoom: position ? 17 : 5,
          mapId: googleMapId(),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        map.current = instance;
        setLibraries(loaded);

        void loadGooglePlaces()
          .then((places) => {
            if (cancelled || !searchElement.current) return;
            autocomplete = new places.PlaceAutocompleteElement({
              includedRegionCodes: ["jp"],
              placeholder: "店舗名・地名で検索",
              requestedLanguage: "ja",
              requestedRegion: "jp",
            });
            autocomplete.className = "place-search-element";
            autocomplete.description = "Google マップで酒屋を検索";
            searchElement.current.replaceChildren(autocomplete);

            handleSelect = (event) => {
              void (async () => {
                try {
                  const place = event.placePrediction.toPlace();
                  await place.fetchFields({
                    fields: [
                      "id",
                      "displayName",
                      "location",
                      "addressComponents",
                    ],
                  });
                  if (!place.id || !place.location)
                    throw new Error("店舗の地図位置を取得できませんでした");
                  const selected = {
                    latitude: place.location.lat(),
                    longitude: place.location.lng(),
                    googlePlaceId: place.id,
                    name: place.displayName || "",
                    prefecture: component(place.addressComponents, [
                      "administrative_area_level_1",
                    ]),
                    city: municipality(place.addressComponents),
                    label: place.displayName || "選択した店舗",
                  };
                  instance.setCenter({
                    lat: selected.latitude,
                    lng: selected.longitude,
                  });
                  instance.setZoom(17);
                  onPlaceSelectRef.current(selected);
                  setError("");
                } catch (reason) {
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "店舗を検索できませんでした",
                  );
                }
              })();
            };
            autocomplete.addEventListener("gmp-select", handleSelect);
            autocomplete.addEventListener("gmp-error", () =>
              setError(
                "店舗検索を利用できませんでした。地図から位置を選べます。",
              ),
            );
          })
          .catch(() =>
            setError(
              "店舗検索を読み込めませんでした。地図から位置を選べます。",
            ),
          );

        clickListener = instance.addListener(
          "click",
          (event: google.maps.MapMouseEvent) => {
            if (!event.latLng) return;
            onChangeRef.current({
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            });
          },
        );
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
      clickListener?.remove();
      if (autocomplete && handleSelect)
        autocomplete.removeEventListener("gmp-select", handleSelect);
      searchElement.current?.replaceChildren();
      if (marker.current) marker.current.map = null;
      marker.current = null;
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!libraries || !map.current || !position) return;
    const point = { lat: position.latitude, lng: position.longitude };
    map.current.setCenter(point);
    map.current.setZoom(17);
    if (!marker.current) {
      const pin = new libraries.marker.PinElement({
        background: "#b84a3a",
        borderColor: "#ffffff",
        glyphColor: "#ffffff",
      });
      marker.current = new libraries.marker.AdvancedMarkerElement({
        map: map.current,
        position: point,
        content: pin,
        title: "酒屋の位置",
        gmpDraggable: true,
      });
      marker.current.addListener("dragend", () => {
        const current = marker.current?.position;
        if (!current) return;
        const value = current as google.maps.LatLng;
        onChangeRef.current({
          latitude:
            typeof value.lat === "function" ? value.lat() : Number(value.lat),
          longitude:
            typeof value.lng === "function" ? value.lng() : Number(value.lng),
        });
      });
    } else {
      marker.current.position = point;
      marker.current.map = map.current;
    }
  }, [libraries, position]);

  return (
    <>
      <div ref={searchElement} className="place-search" />
      {error && (
        <p className="location-message error" role="alert">
          {error}
        </p>
      )}
      {children}
      <div
        ref={element}
        className="location-picker-map google-map"
        aria-label="酒屋の位置を選ぶGoogleマップ"
      />
    </>
  );
}
