"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { useEffect, useState } from "react";

type Position = { latitude: number; longitude: number };
type PlaceSelection = Position & {
  googlePlaceId: string;
  label: string;
  name: string;
  prefecture: string | null;
  city: string | null;
};
type Precision = "PLACE" | "USER_ADJUSTED";
type DuplicateCandidate = {
  id: string;
  name: string;
  prefecture: string | null;
  city: string | null;
  is_active: boolean;
  distance_m?: number;
};
type DuplicateState = { blocking: boolean; pending: boolean };

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
  duplicateCheckEnabled,
  onDuplicateStateChange,
  onPlaceDetails,
}: {
  initialPosition: Position | null;
  initialGooglePlaceId: string | null;
  duplicateCheckEnabled: boolean;
  onDuplicateStateChange: (state: DuplicateState) => void;
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
  const [exactDuplicate, setExactDuplicate] =
    useState<DuplicateCandidate | null>(null);
  const [nearbyDuplicates, setNearbyDuplicates] = useState<
    DuplicateCandidate[]
  >([]);
  const [duplicateError, setDuplicateError] = useState("");
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  useEffect(() => {
    if (!duplicateCheckEnabled || !position) {
      setExactDuplicate(null);
      setNearbyDuplicates([]);
      setDuplicateError("");
      setCheckingDuplicates(false);
      onDuplicateStateChange({ blocking: false, pending: false });
      return;
    }

    const abort = new AbortController();
    setExactDuplicate(null);
    setNearbyDuplicates([]);
    setDuplicateError("");
    setCheckingDuplicates(true);
    onDuplicateStateChange({ blocking: false, pending: true });
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        latitude: String(position.latitude),
        longitude: String(position.longitude),
      });
      if (googlePlaceId) params.set("google_place_id", googlePlaceId);
      try {
        const response = await fetch(`/api/shops/duplicates?${params}`, {
          signal: abort.signal,
        });
        const result = (await response.json()) as {
          exact?: DuplicateCandidate | null;
          nearby?: DuplicateCandidate[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error);
        const exact = result.exact ?? null;
        setExactDuplicate(exact);
        setNearbyDuplicates(result.nearby ?? []);
        onDuplicateStateChange({
          blocking: Boolean(exact),
          pending: false,
        });
      } catch (error) {
        if (abort.signal.aborted) return;
        setExactDuplicate(null);
        setNearbyDuplicates([]);
        setDuplicateError(
          error instanceof Error
            ? error.message
            : "登録済みの酒屋を確認できませんでした",
        );
        onDuplicateStateChange({ blocking: false, pending: false });
      } finally {
        if (!abort.signal.aborted) setCheckingDuplicates(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [duplicateCheckEnabled, googlePlaceId, onDuplicateStateChange, position]);

  function selectPlace(place: PlaceSelection) {
    if (duplicateCheckEnabled)
      onDuplicateStateChange({ blocking: false, pending: true });
    setPosition(place);
    setGooglePlaceId(place.googlePlaceId);
    setGeocode("PLACE");
    setSelectedPlace(place.label);
    onPlaceDetails(place);
  }

  function adjustPosition(next: Position) {
    if (duplicateCheckEnabled)
      onDuplicateStateChange({ blocking: false, pending: true });
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
      >
        {duplicateCheckEnabled && checkingDuplicates && (
          <p className="duplicate-check-status" role="status">
            登録済みの酒屋を確認しています…
          </p>
        )}
        {duplicateCheckEnabled && duplicateError && (
          <p className="location-message error" role="alert">
            {duplicateError}。時間をおいて再度お試しください。
          </p>
        )}
        {duplicateCheckEnabled && exactDuplicate && (
          <section className="duplicate-shop-panel exact" role="alert">
            <div className="duplicate-shop-heading">
              <Store size={20} aria-hidden="true" />
              <div>
                <strong>この店舗は登録済みです</strong>
                <p>新しく登録せず、既存の店舗ページを利用してください。</p>
              </div>
            </div>
            <DuplicateShopLink shop={exactDuplicate} />
          </section>
        )}
        {duplicateCheckEnabled &&
          !exactDuplicate &&
          nearbyDuplicates.length > 0 && (
            <section className="duplicate-shop-panel" aria-live="polite">
              <div className="duplicate-shop-heading">
                <Store size={20} aria-hidden="true" />
                <div>
                  <strong>近くに登録済みの酒屋があります</strong>
                  <p>
                    同じ店舗がないか確認してください。別店舗なら、このまま登録できます。
                  </p>
                </div>
              </div>
              <div className="duplicate-shop-list">
                {nearbyDuplicates.map((shop) => (
                  <DuplicateShopLink key={shop.id} shop={shop} />
                ))}
              </div>
            </section>
          )}
      </LocationMap>
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

function DuplicateShopLink({ shop }: { shop: DuplicateCandidate }) {
  const destination = shop.is_active
    ? `/shops/${shop.id}`
    : `/history?type=shop&id=${shop.id}`;
  const area = [shop.prefecture, shop.city].filter(Boolean).join(" ");
  return (
    <Link className="duplicate-shop-link" href={destination}>
      <span>
        <strong>{shop.name}</strong>
        <small>
          {area || "地域未登録"}
          {typeof shop.distance_m === "number"
            ? `・約${shop.distance_m}m先`
            : ""}
          {!shop.is_active ? "・現在非表示" : ""}
        </small>
      </span>
      <span className="duplicate-shop-action">
        {shop.is_active ? "店舗ページを見る" : "更新履歴を見る"}
        <ArrowRight size={17} aria-hidden="true" />
      </span>
    </Link>
  );
}
