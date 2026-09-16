"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { mutate } from "@/lib/client";
import type { Brewery, EntityType } from "@/lib/types";
import { LocationPicker } from "@/components/location-picker";
import { useToast } from "@/components/toast-provider";
const entityLabels = { shop: "酒屋", brand: "銘柄", brewery: "酒蔵" };
export function MasterForm({
  type,
  id,
  initial,
  initialBrewery,
  shopId,
  kanaOnly = false,
}: {
  type: EntityType;
  id: string | null;
  initial: Record<string, unknown>;
  initialBrewery: Brewery | null;
  shopId?: string;
  kanaOnly?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [searchError, setSearchError] = useState("");
  const [busy, setBusy] = useState(false);
  const [brewery, setBrewery] = useState(initialBrewery);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Brewery[]>([]);
  const [shopName, setShopName] = useState(String(initial.name ?? ""));
  const [shopPrefecture, setShopPrefecture] = useState(
    String(initial.prefecture ?? ""),
  );
  const [shopCity, setShopCity] = useState(String(initial.city ?? ""));
  const [duplicateState, setDuplicateState] = useState({
    blocking: false,
    pending: false,
  });
  useEffect(() => {
    if (type !== "brand" || !query.trim()) {
      setResults([]);
      setSearchError("");
      return;
    }
    const abort = new AbortController();
    setSearchError("");
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/breweries?q=" + encodeURIComponent(query), {
          signal: abort.signal,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setResults(data);
      } catch (e) {
        if (!abort.signal.aborted)
          setSearchError(
            e instanceof Error ? e.message : "検索できませんでした",
          );
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, type]);
  const value = (key: string) => String(initial[key] ?? "");
  async function saveKana(form: HTMLFormElement) {
    if (!id || type === "shop") return;
    setBusy(true);
    const f = new FormData(form);
    const text = (key: string) => String(f.get(key) ?? "").trim();
    try {
      const result = await mutate({
        kind: "master_kana",
        type,
        id,
        name_kana: text("name_kana") || null,
        reason: text("reason") || null,
      });
      showToast(`${entityLabels[type]}のかなを保存しました`);
      router.push("/history?type=" + type + "&id=" + result.id);
      router.refresh();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "保存できませんでした",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(form: HTMLFormElement) {
    setBusy(true);
    const f = new FormData(form);
    const text = (key: string) => String(f.get(key) ?? "").trim();
    const nullable = (key: string) => text(key) || null;
    try {
      if (type === "shop" && !id && duplicateState.pending)
        throw new Error("登録済み店舗の確認が終わるまでお待ちください");
      if (type === "shop" && !id && duplicateState.blocking)
        throw new Error("この店舗はすでに登録されています");
      let selectedBrewery = brewery?.id ?? null;
      const data: Record<string, unknown> = {
        name: text("name"),
        name_kana: type === "shop" ? text("name_kana") : nullable("name_kana"),
      };
      if (id) data.is_active = f.get("is_active") === "on";
      if (type === "brand") data.brewery_id = selectedBrewery;
      else {
        data.prefecture = nullable("prefecture");
        if (type === "brewery") data.website_url = nullable("website_url");
      }
      if (type === "shop") {
        const latitude = text("latitude");
        const longitude = text("longitude");
        if (!latitude || !longitude)
          throw new Error("地図で店舗位置を設定してください");
        Object.assign(data, {
          city: nullable("city"),
          latitude: Number(latitude),
          longitude: Number(longitude),
          google_place_id: nullable("google_place_id"),
        });
        const geocodeSource = text("geocode_source");
        const geocodePrecision = text("geocode_precision");
        if (geocodeSource && geocodePrecision) {
          data.geocode_source = geocodeSource;
          data.geocode_precision = geocodePrecision;
        }
      }
      const result = await mutate({
        kind: "master",
        type,
        id,
        data,
        reason: nullable("reason"),
      });
      showToast(
        id
          ? `${entityLabels[type]}の変更を保存しました`
          : `${entityLabels[type]}を登録しました`,
      );
      router.push(
        type === "shop"
          ? "/shops/" + result.id
          : type === "brand" && shopId
            ? "/post?shop_id=" + shopId + "&brand_id=" + result.id
            : "/history?type=" + type + "&id=" + result.id,
      );
      router.refresh();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "保存できませんでした",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  if (kanaOnly && id && type !== "shop")
    return (
      <form
        className="card form-stack kana-only-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveKana(event.currentTarget);
        }}
      >
        <div className="master-readonly-summary">
          <span>{entityLabels[type]}名</span>
          <strong>{value("name")}</strong>
          {type === "brand" && initialBrewery && (
            <small>
              {initialBrewery.name}
              {initialBrewery.prefecture
                ? `・${initialBrewery.prefecture}`
                : ""}
            </small>
          )}
          {type === "brewery" && value("prefecture") && (
            <small>{value("prefecture")}</small>
          )}
        </div>
        <label className="master-kana-field">
          かな <span className="muted">任意</span>
          <input
            name="name_kana"
            defaultValue={value("name_kana")}
            maxLength={150}
            autoFocus
          />
          <small>
            現在の読みを確認し、誤りや未登録の場合だけ修正してください。空欄で保存すると未登録に戻ります。
          </small>
        </label>
        <label>
          変更理由 <span className="muted">任意</span>
          <textarea
            name="reason"
            maxLength={500}
            placeholder="例：公式サイトの表記に合わせて修正"
          />
        </label>
        <button disabled={busy} type="submit" className="button full">
          {busy ? "保存しています…" : "かなを保存"}
        </button>
      </form>
    );
  return (
    <form
      className="card form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save(e.currentTarget);
      }}
    >
      {type === "shop" && (
        <LocationPicker
          initialPosition={
            typeof initial.latitude === "number" &&
            typeof initial.longitude === "number"
              ? {
                  latitude: initial.latitude,
                  longitude: initial.longitude,
                }
              : null
          }
          initialGooglePlaceId={
            typeof initial.google_place_id === "string"
              ? initial.google_place_id
              : null
          }
          duplicateCheckEnabled={!id}
          onDuplicateStateChange={setDuplicateState}
          onPlaceDetails={(details) => {
            if (details.name) setShopName(details.name);
            setShopPrefecture(details.prefecture ?? "");
            setShopCity(details.city ?? "");
          }}
        />
      )}
      <label>
        {entityLabels[type]}名<span className="required">必須</span>
        <input
          name="name"
          defaultValue={type === "shop" ? undefined : value("name")}
          value={type === "shop" ? shopName : undefined}
          onChange={
            type === "shop"
              ? (event) => setShopName(event.target.value)
              : undefined
          }
          autoFocus={!id && type !== "shop"}
          required
          maxLength={150}
        />
      </label>
      <label className={type === "shop" ? undefined : "master-kana-field"}>
        かな{" "}
        {type === "shop" ? (
          <span className="required">必須</span>
        ) : (
          <span className="muted">任意</span>
        )}
        <input
          name="name_kana"
          defaultValue={value("name_kana")}
          required={type === "shop"}
          maxLength={150}
        />
        {type !== "shop" && (
          <small>現在の読みを確認し、必要な場合だけ修正してください。</small>
        )}
      </label>
      {type === "brand" ? (
        <div>
          <label>酒蔵</label>
          {brewery && (
            <div className="fixed-shop">
              <span>
                {brewery.name} <small>{brewery.prefecture}</small>
              </span>
              <button
                type="button"
                className="inline-link"
                onClick={() => setBrewery(null)}
              >
                選び直す
              </button>
              {id && (
                <Link
                  className="inline-link"
                  href={"/edit/brewery/" + brewery.id}
                >
                  酒蔵を編集
                </Link>
              )}
            </div>
          )}
          {!brewery && (
            <>
              <label className="searchbox" style={{ marginTop: 8 }}>
                <Search size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="酒蔵名・かなを検索"
                  aria-label="酒蔵名・かなを検索"
                />
              </label>
              {results.map((b) => (
                <button
                  type="button"
                  className="search-result"
                  key={b.id}
                  onClick={() => {
                    setBrewery(b);
                    setQuery("");
                  }}
                >
                  <span>
                    {b.name}
                    <small>{b.prefecture ?? "地域未登録"}</small>
                  </span>
                </button>
              ))}
              <p className="hint">
                酒蔵が分からない場合は、未選択で登録できます。
              </p>
            </>
          )}
          <p className="hint">酒蔵マスタも、さけのわから同期しています。</p>
        </div>
      ) : (
        <>
          <label>
            都道府県 <span className="muted">任意</span>
            <input
              name="prefecture"
              defaultValue={type === "shop" ? undefined : value("prefecture")}
              value={type === "shop" ? shopPrefecture : undefined}
              onChange={
                type === "shop"
                  ? (event) => setShopPrefecture(event.target.value)
                  : undefined
              }
              maxLength={50}
              placeholder="例：長野県"
            />
          </label>
          {type === "shop" && (
            <>
              <label>
                市区町村 <span className="muted">任意</span>
                <input
                  name="city"
                  value={shopCity}
                  onChange={(event) => setShopCity(event.target.value)}
                  maxLength={100}
                />
              </label>
            </>
          )}
          {type === "brewery" && (
            <label>
              公式サイト <span className="muted">任意</span>
              <input
                name="website_url"
                type="url"
                defaultValue={value("website_url")}
                placeholder="https://"
              />
            </label>
          )}
        </>
      )}
      {id && (
        <>
          <label className="check-label">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={initial.is_active !== false}
            />
            {entityLabels[type]}を有効にする
          </label>
          <p className="hint">
            チェックを外すと検索・取扱情報に表示されなくなります。履歴は残ります。
          </p>
          <label>
            変更理由 <span className="muted">任意</span>
            <textarea
              name="reason"
              maxLength={500}
              placeholder="例：お店の移転に伴い地図位置を変更"
            />
          </label>
        </>
      )}
      {searchError && (
        <p className="notice error" role="alert">
          {searchError}
        </p>
      )}
      <button
        disabled={
          busy ||
          (type === "shop" &&
            !id &&
            (duplicateState.pending || duplicateState.blocking))
        }
        type="submit"
        className="button full"
      >
        {busy
          ? "保存しています…"
          : type === "shop" && !id && duplicateState.pending
            ? "登録済み店舗を確認中…"
            : type === "shop" && !id && duplicateState.blocking
              ? "登録済みの店舗です"
              : id
                ? "変更を保存"
                : entityLabels[type] + "を登録"}
      </button>
    </form>
  );
}
