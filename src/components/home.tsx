"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X, LocateFixed, Plus, Store } from "lucide-react";
import Map from "./map";
import type { Brand, Bounds, Shop } from "@/lib/types";

type ShopBrandPreview = { brands: Brand[]; total: number };

export function Home({
  initialShops,
  ready,
  initialBrand,
  initialError,
}: {
  initialShops: Shop[];
  ready: boolean;
  initialBrand: Brand | null;
  initialError?: string;
}) {
  const [shops, setShops] = useState(initialShops);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ brands: Brand[]; shops: Shop[] }>({
    brands: [],
    shops: [],
  });
  const [brand, setBrand] = useState<Brand | null>(initialBrand);
  const [selected, setSelected] = useState<string | null>(null);
  const [pinBrands, setPinBrands] = useState<Record<string, Brand[]>>({});
  const [listBrands, setListBrands] = useState<
    Record<string, ShopBrandPreview>
  >({});
  const [bounds, setBounds] = useState<Bounds>();
  const [center, setCenter] = useState<[number, number]>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const searchSequence = useRef(0);
  const areaSequence = useRef(0);
  const searchAtLocation = useRef(false);
  const loadShops = useCallback(async (filter: Brand | null, area?: Bounds) => {
    const seq = ++areaSequence.current;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter) params.set("brand_id", filter.id);
      if (area)
        Object.entries(area).forEach(([k, v]) => params.set(k, String(v)));
      const res = await fetch("/api/shops?" + params);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (seq !== areaSequence.current) return;
      setShops(data);
      setSelected(null);
      setDirty(false);
    } catch (e) {
      if (seq === areaSequence.current)
        setError(e instanceof Error ? e.message : "検索できませんでした");
    } finally {
      if (seq === areaSequence.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        searchAtLocation.current = true;
        setCenter([p.coords.latitude, p.coords.longitude]);
      },
      () => {},
      { timeout: 8000, maximumAge: 300000 },
    );
  }, []);
  useEffect(() => {
    const seq = ++searchSequence.current;
    if (!query.trim()) {
      setResults({ brands: [], shops: [] });
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          "/api/search?q=" + encodeURIComponent(query.trim()),
          { signal: abort.signal },
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (seq === searchSequence.current) setResults(data);
      } catch (e) {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "検索できませんでした");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query]);
  useEffect(() => {
    if (!selected || Object.hasOwn(pinBrands, selected)) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/shops/${selected}/brands`, {
          signal: abort.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setPinBrands((current) => ({ ...current, [selected]: data }));
      } catch (reason) {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "取扱銘柄を取得できませんでした",
          );
      }
    })();
    return () => abort.abort();
  }, [pinBrands, selected]);
  useEffect(() => {
    const abort = new AbortController();
    const ids = shops.map((shop) => shop.id);
    if (!ids.length) {
      setListBrands({});
      return () => abort.abort();
    }
    setListBrands({});
    void Promise.all(
      Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) =>
        ids.slice(index * 50, index * 50 + 50),
      ).map(async (chunk) => {
        const response = await fetch(
          `/api/shops/brands?ids=${encodeURIComponent(chunk.join(","))}`,
          { signal: abort.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as Record<string, ShopBrandPreview>;
      }),
    )
      .then((parts) => setListBrands(Object.assign({}, ...parts)))
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "取扱銘柄を取得できませんでした",
          );
      });
    return () => abort.abort();
  }, [shops]);
  function chooseBrand(value: Brand | null) {
    setBrand(value);
    setQuery("");
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("brand_id", value.id);
    else url.searchParams.delete("brand_id");
    window.history.replaceState(null, "", url);
    void loadShops(value);
  }
  function selectShop(shop: Shop) {
    setSelected(shop.id);
    if (typeof shop.latitude === "number" && typeof shop.longitude === "number")
      setCenter([shop.latitude, shop.longitude]);
  }
  const sorted = selected
    ? [
        ...shops.filter((s) => s.id === selected),
        ...shops.filter((s) => s.id !== selected),
      ]
    : shops;
  const selectedShop = shops.find((shop) => shop.id === selected);
  return (
    <main id="main" className="explore">
      <div className="explore-grid">
        <aside className="explore-panel">
          <div className="search-area">
            <label className="searchbox">
              <Search size={21} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="銘柄・酒屋を検索"
                aria-label="銘柄・酒屋を検索"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="検索をクリア">
                  <X size={18} />
                </button>
              )}
            </label>
            {query.trim() && (
              <div className="search-results" aria-live="polite">
                <h3>銘柄</h3>
                {results.brands.map((b) => (
                  <button
                    className="search-result"
                    key={b.id}
                    onClick={() => chooseBrand(b)}
                  >
                    <span>
                      <strong>{b.name}</strong>
                      <small>
                        {b.brewery_name ?? "酒蔵未登録"} /{" "}
                        {b.prefecture ?? "地域未登録"}
                      </small>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                ))}
                <h3>酒屋</h3>
                {results.shops.map((s) => (
                  <Link
                    className="search-result"
                    key={s.id}
                    href={"/shops/" + s.id}
                  >
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {s.prefecture ?? "地域未登録"}
                        {s.city ? ` ${s.city}` : ""}
                      </small>
                    </span>
                    <ArrowRight size={18} />
                  </Link>
                ))}
                {!results.brands.length && !results.shops.length && (
                  <p className="muted">該当する銘柄・酒屋がありません</p>
                )}
              </div>
            )}
          </div>
          <div className="result-heading">
            <div>
              <h2>
                {brand ? `「${brand.name}」を扱う酒屋` : "地図の酒屋"}{" "}
                <span className="count">{shops.length}</span>
              </h2>
            </div>
            {brand && (
              <button className="chip" onClick={() => chooseBrand(null)}>
                {brand.name}
                <X size={15} />
              </button>
            )}
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="shop-list" aria-live="polite">
            {sorted.map((s) => (
              <button
                type="button"
                key={s.id}
                className={"shop-card " + (selected === s.id ? "active" : "")}
                aria-pressed={selected === s.id}
                onClick={() => selectShop(s)}
              >
                <span className="store-icon">
                  <Store size={23} />
                </span>
                <span className="shop-card-copy">
                  <h3>{s.name}</h3>
                  {listBrands[s.id]?.brands.length ? (
                    <span className="shop-card-brands">
                      {listBrands[s.id].brands.map((item) => (
                        <span className="shop-card-brand" key={item.id}>
                          {item.name}
                        </span>
                      ))}
                      {listBrands[s.id].total > 10 && (
                        <span className="shop-card-more">
                          ほか{listBrands[s.id].total - 10}銘柄
                        </span>
                      )}
                    </span>
                  ) : listBrands[s.id] ? (
                    <span className="shop-card-empty">取扱銘柄は未登録</span>
                  ) : null}
                </span>
              </button>
            ))}
            {shops.length === 0 && (
              <div className="empty">
                <Store size={32} />
                <h3>
                  {ready
                    ? "このエリアの酒屋はまだありません"
                    : "酒屋との出会いは、ここから。"}
                </h3>
                <p>
                  {ready
                    ? "地図を動かしてエリアを広げるか、知っている酒屋を登録してみましょう。"
                    : "接続設定後、銘柄を検索したり、酒屋での発見を記録できます。"}
                </p>
              </div>
            )}
          </div>
          <Link href="/edit/shop/new" className="add-shop">
            <Plus size={18} /> 新しい酒屋を登録
          </Link>
        </aside>
        <section className="map-panel" aria-label="酒屋マップ">
          <Map
            shops={shops}
            selected={selected}
            onSelect={(id) => {
              const shop = shops.find((item) => item.id === id);
              if (shop) selectShop(shop);
            }}
            onBounds={(b) => {
              setBounds(b);
              setDirty(true);
              if (searchAtLocation.current) {
                searchAtLocation.current = false;
                void loadShops(brand, b);
              }
            }}
            center={center}
          />
          <div className="map-top">
            <button
              className="icon-button"
              aria-label="現在地に移動"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition(
                  (p) => {
                    setCenter([p.coords.latitude, p.coords.longitude]);
                  },
                  () =>
                    setError(
                      "現在地を取得できませんでした。地図からエリアを選んでください。",
                    ),
                )
              }
            >
              <LocateFixed size={22} />
            </button>
          </div>
          <button
            className={"button area-button " + (dirty ? "" : "ghost")}
            disabled={busy}
            onClick={() => void loadShops(brand, bounds)}
          >
            <Search size={17} />
            {busy ? "検索しています…" : "このエリアを検索"}
          </button>
          {selected && selectedShop && (
            <Link className="map-selected" href={"/shops/" + selected}>
              <Store size={24} />
              <div className="map-selected-copy">
                <strong>{selectedShop.name}</strong>
                {pinBrands[selected]?.length > 0 && (
                  <div className="pin-brands">
                    {pinBrands[selected].map((item) => (
                      <span className="pin-brand" key={item.id}>
                        {item.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ArrowRight size={20} />
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
