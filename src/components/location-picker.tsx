"use client";
import dynamic from "next/dynamic";
import { useState } from "react";

type Position = { latitude: number; longitude: number };
type PlaceSelection = Position & {
  googlePlaceId: string;
  label: string;
  name: string;
  prefecture: string | null;
  city: string | null;
};
type Precision = "PLACE" | "USER_ADJUSTED";

const LocationMap = dynamic(() => import("./location-picker-map"), {
  ssr: false,
  loading: () => (
    <div className="location-picker-map map-loading" role="status">
      地図を読み込んでいます…
    </div>
  ),
});

export function LocationPicker({
  initialPosition,
  initialGooglePlaceId,
  onPlaceDetails,
}: {
  initialPosition: Position | null;
  initialGooglePlaceId: string | null;
  onPlaceDetails: (details: {
    name: string;
    prefecture: string | null;
    city: string | null;
  }) => void;
}) {
  const [position, setPosition] = useState<Position | null>(initialPosition);
  const [googlePlaceId, setGooglePlaceId] = useState(initialGooglePlaceId);
  const [geocode, setGeocode] = useState<Precision | null>(null);
  const [selectedPlace, setSelectedPlace] = useState("");

  function selectPlace(place: PlaceSelection) {
    setPosition(place);
    setGooglePlaceId(place.googlePlaceId);
    setGeocode("PLACE");
    setSelectedPlace(place.label);
    onPlaceDetails(place);
  }

  function adjustPosition(next: Position) {
    setPosition(next);
    setGooglePlaceId(null);
    setGeocode("USER_ADJUSTED");
    setSelectedPlace("");
  }

  return (
    <section className="location-picker" aria-labelledby="location-heading">
      <div className="location-picker-head">
        <div>
          <h3 id="location-heading">
            地図位置<span className="required">必須</span>
          </h3>
          <p className="hint">
            店舗を検索して候補を選ぶと、店舗名・都道府県・市区町村も入力されます。
          </p>
        </div>
      </div>
      <LocationMap
        position={position}
        onChange={adjustPosition}
        onPlaceSelect={selectPlace}
      />
      <input
        type="hidden"
        name="latitude"
        value={position ? String(position.latitude) : ""}
      />
      <input
        type="hidden"
        name="longitude"
        value={position ? String(position.longitude) : ""}
      />
      <input type="hidden" name="google_place_id" value={googlePlaceId ?? ""} />
      <input
        type="hidden"
        name="geocode_source"
        value={geocode ? "google" : ""}
      />
      <input type="hidden" name="geocode_precision" value={geocode ?? ""} />
      <p className="location-status" aria-live="polite">
        {position
          ? selectedPlace
            ? `${selectedPlace}を選択しました。地図位置を確認してください。`
            : `地図位置を設定済みです（緯度 ${position.latitude.toFixed(6)}、経度 ${position.longitude.toFixed(6)}）。`
          : "店舗検索または地図クリックで位置を設定してください。"}
      </p>
      <p className="geocoder-credit">店舗検索・地図: Google Maps</p>
    </section>
  );
}
