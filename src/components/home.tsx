"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X, LocateFixed, Plus, Store } from "lucide-react";
import Map from "./map";
import { MapShopCard } from "./home/map-shop-card";
import {
  ShopCommentPopover,
  useShopCommentPopover,
} from "./home/shop-comment-popover";
import { ShopListCard } from "./home/shop-list-card";
import { useShopMetadata } from "./home/use-shop-metadata";
import type { Brand, Bounds, Shop } from "@/lib/types";

export function Home({
  ready,
  initialBrand,
  initialError,
}: {
  ready: boolean;
  initialBrand: Brand | null;
  initialError?: string;
}) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ brands: Brand[]; shops: Shop[] }>({
    brands: [],
    shops: [],
  });
  const [brand, setBrand] = useState<Brand | null>(initialBrand);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusedShop, setFocusedShop] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds>();
  const [center, setCenter] = useState<[number, number]>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolvingInitialArea, setResolvingInitialArea] = useState(ready);
  const [error, setError] = useState(initialError ?? "");
  const searchSequence = useRef(0);
  const areaSequence = useRef(0);
  const requestedInitialArea = useRef(false);
  const searchAtLocation = useRef(false);
  const mapPanelRef = useRef<HTMLElement>(null);
  const {
    allBrands: allListBrands,
    brandPreviews: listBrands,
    collapseBrands,
    expandedShopId: expandedBrandShop,
    latestComments: listComments,
    loadingShopId: loadingBrandShop,
    toggleBrands: toggleShopBrands,
  } = useShopMetadata(shops, setError);
  const {
    close: closeComment,
    popoverRef: commentPreviewRef,
    position: commentPopoverPosition,
    shopId: openComment,
    toggle: toggleShopComment,
  } = useShopCommentPopover();
  const loadShops = useCallback(
    async (filter: Brand | null, area?: Bounds) => {
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
        collapseBrands();
        setDirty(false);
      } catch (e) {
        if (seq === areaSequence.current)
          setError(e instanceof Error ? e.message : "検索できませんでした");
      } finally {
        if (seq === areaSequence.current) setBusy(false);
      }
    },
    [collapseBrands],
  );
  useEffect(() => {
    if (requestedInitialArea.current || !ready) return;
    requestedInitialArea.current = true;
    const loadDefaultShops = () => {
      void loadShops(initialBrand).finally(() =>
        setResolvingInitialArea(false),
      );
    };
    if (!navigator.geolocation) {
      loadDefaultShops();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        searchAtLocation.current = true;
        setCenter([p.coords.latitude, p.coords.longitude]);
      },
      loadDefaultShops,
      { timeout: 8000, maximumAge: 300000 },
    );
  }, [initialBrand, loadShops, ready]);
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
  function chooseBrand(value: Brand | null) {
    setBrand(value);
    setQuery("");
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("brand_id", value.id);
    else url.searchParams.delete("brand_id");
    window.history.replaceState(null, "", url);
    void loadShops(value);
  }
  function selectShop(shop: Shop, scrollToMap = false) {
    setSelected(shop.id);
    if (typeof shop.latitude === "number" && typeof shop.longitude === "number")
      setCenter([shop.latitude, shop.longitude]);
    if (scrollToMap && window.matchMedia("(max-width: 800px)").matches) {
      window.requestAnimationFrame(() =>
        mapPanelRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        }),
      );
    }
  }
  const sorted = selected
    ? [
        ...shops.filter((s) => s.id === selected),
        ...shops.filter((s) => s.id !== selected),
      ]
    : shops;
  const selectedShop = shops.find((shop) => shop.id === selected);
  const selectedPreview = selected ? listBrands[selected] : undefined;
  const selectedBrandsExpanded = expandedBrandShop === selected;
  const selectedDisplayedBrands = selectedBrandsExpanded
    ? selected
      ? (allListBrands[selected] ?? selectedPreview?.brands)
      : undefined
    : selectedPreview?.brands;
  const openCommentShop = shops.find((shop) => shop.id === openComment);
  const openCommentData = openComment ? listComments[openComment] : undefined;

  useEffect(() => {
    if (openComment && !openCommentShop) closeComment();
  }, [closeComment, openComment, openCommentShop]);

  return (
    <main id="main" className="explore">
      <div className="explore-grid">
        <aside className="explore-panel">
          <div className="search-area">
            <div className="search-row">
              <label className="searchbox">
                <Search size={21} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="銘柄・酒屋を検索"
                  aria-label="銘柄・酒屋を検索"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="検索をクリア"
                  >
                    <X size={18} />
                  </button>
                )}
              </label>
              <Link
                href="/edit/shop/new"
                className="mobile-add-shop"
                aria-label="新しい酒屋を登録"
                title="新しい酒屋を登録"
              >
                <Plus size={22} />
              </Link>
            </div>
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
                <span className="count">
                  {resolvingInitialArea ? "…" : shops.length}
                </span>
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
            {sorted.map((s) => {
              const latestComment = listComments[s.id];
              const preview = listBrands[s.id];
              const expanded = expandedBrandShop === s.id;
              const displayedBrands = expanded
                ? (allListBrands[s.id] ?? preview?.brands)
                : preview?.brands;
              return (
                <ShopListCard
                  key={s.id}
                  brands={displayedBrands}
                  commentOpen={openComment === s.id}
                  expanded={expanded}
                  latestComment={latestComment}
                  loading={loadingBrandShop === s.id}
                  onCommentToggle={(anchor) => toggleShopComment(s.id, anchor)}
                  onHighlight={setFocusedShop}
                  onSelect={() => selectShop(s, true)}
                  onToggleBrands={() => void toggleShopBrands(s.id)}
                  preview={preview}
                  selected={selected === s.id}
                  shop={s}
                />
              );
            })}
            {shops.length === 0 && (
              <div className="empty">
                {resolvingInitialArea ? (
                  <LocateFixed size={32} />
                ) : (
                  <Store size={32} />
                )}
                <h3>
                  {resolvingInitialArea
                    ? "現在地周辺の酒屋を探しています"
                    : ready
                      ? "このエリアの酒屋はまだありません"
                      : "酒屋との出会いは、ここから。"}
                </h3>
                <p>
                  {resolvingInitialArea
                    ? "位置情報を確認しています。"
                    : ready
                      ? "地図を動かしてエリアを広げるか、知っている酒屋を登録してみましょう。"
                      : "接続設定後、銘柄を検索したり、酒屋での発見を記録できます。"}
                </p>
              </div>
            )}
          </div>
          {openComment &&
            openCommentShop &&
            commentPopoverPosition &&
            openCommentData && (
              <ShopCommentPopover
                comment={openCommentData}
                onClose={closeComment}
                popoverRef={commentPreviewRef}
                position={commentPopoverPosition}
                shopId={openComment}
                shopName={openCommentShop.name}
              />
            )}
          <Link href="/edit/shop/new" className="add-shop">
            <Plus size={18} /> 新しい酒屋を登録
          </Link>
        </aside>
        <section
          ref={mapPanelRef}
          className="map-panel"
          aria-label="酒屋マップ"
        >
          <Map
            shops={shops}
            selected={selected}
            highlighted={focusedShop}
            onSelect={(id) => {
              const shop = shops.find((item) => item.id === id);
              if (shop) selectShop(shop);
            }}
            onBounds={(b) => {
              setBounds(b);
              setDirty(true);
              if (searchAtLocation.current) {
                searchAtLocation.current = false;
                void loadShops(brand, b).finally(() =>
                  setResolvingInitialArea(false),
                );
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
            disabled={busy || resolvingInitialArea}
            onClick={() => void loadShops(brand, bounds)}
          >
            <Search size={17} />
            {resolvingInitialArea
              ? "現在地を確認しています…"
              : busy
                ? "検索しています…"
                : "このエリアを検索"}
          </button>
          {selected && selectedShop && (
            <MapShopCard
              brands={selectedDisplayedBrands}
              commentOpen={openComment === selected}
              expanded={selectedBrandsExpanded}
              latestComment={listComments[selected]}
              loading={loadingBrandShop === selected}
              onClose={() => {
                setSelected(null);
                collapseBrands();
              }}
              onCommentToggle={(anchor) => toggleShopComment(selected, anchor)}
              onToggleBrands={() => void toggleShopBrands(selected)}
              preview={selectedPreview}
              shop={selectedShop}
            />
          )}
        </section>
      </div>
    </main>
  );
}
