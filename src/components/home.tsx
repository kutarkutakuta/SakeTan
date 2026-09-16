"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Search,
  MapPin,
  X,
  LocateFixed,
  Plus,
  Store,
} from "lucide-react";
import Map from "./map";
import {
  ShopCommentPopover,
  useShopCommentPopover,
} from "./home/shop-comment-popover";
import { ShopListCard } from "./home/shop-list-card";
import { useShopMetadata } from "./home/use-shop-metadata";
import { useToast } from "./toast-provider";
import type { Brand, Bounds, Shop } from "@/lib/types";

type MobileSheetSnap = "peek" | "half" | "full";

function nextSheetSnap(
  current: MobileSheetSnap,
  direction: "up" | "down",
): MobileSheetSnap {
  const snaps: MobileSheetSnap[] = ["peek", "half", "full"];
  const currentIndex = snaps.indexOf(current);
  const nextIndex =
    direction === "up"
      ? Math.min(currentIndex + 1, snaps.length - 1)
      : Math.max(currentIndex - 1, 0);
  return snaps[nextIndex];
}

export function Home({
  ready,
  initialBrand,
  initialShop,
  initialError,
}: {
  ready: boolean;
  initialBrand: Brand | null;
  initialShop: Shop | null;
  initialError?: string;
}) {
  const { showToast } = useToast();
  const initialShopPosition = useMemo(
    () =>
      typeof initialShop?.latitude === "number" &&
      typeof initialShop.longitude === "number"
        ? ([initialShop.latitude, initialShop.longitude] as [number, number])
        : undefined,
    [initialShop],
  );
  const [shops, setShops] = useState<Shop[]>(initialShop ? [initialShop] : []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ brands: Brand[]; shops: Shop[] }>({
    brands: [],
    shops: [],
  });
  const [brand, setBrand] = useState<Brand | null>(initialBrand);
  const [selected, setSelected] = useState<string | null>(
    initialShopPosition ? (initialShop?.id ?? null) : null,
  );
  const [focusedShop, setFocusedShop] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds>();
  const [center, setCenter] = useState<[number, number] | undefined>(
    initialShopPosition,
  );
  const [preserveMapZoom, setPreserveMapZoom] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolvingInitialArea, setResolvingInitialArea] = useState(ready);
  const [error, setError] = useState("");
  const [mobileSheetSnap, setMobileSheetSnap] =
    useState<MobileSheetSnap>("peek");
  const [draggingSheet, setDraggingSheet] = useState(false);
  const searchSequence = useRef(0);
  const areaSequence = useRef(0);
  const requestedInitialArea = useRef(false);
  const searchAtLocation = useRef(false);
  const manualMapFocus = useRef(false);
  const selectedRef = useRef(selected);
  const shopListRef = useRef<HTMLDivElement>(null);
  const shopSheetRef = useRef<HTMLElement>(null);
  const sheetDragStart = useRef<number | null>(null);
  const sheetDragMoved = useRef(false);
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
  selectedRef.current = selected;
  useEffect(() => {
    if (initialError) showToast(initialError, "error");
  }, [initialError, showToast]);
  const syncSelectedShopUrl = useCallback((shopId: string | null) => {
    const url = new URL(window.location.href);
    if (shopId) url.searchParams.set("shop_id", shopId);
    else url.searchParams.delete("shop_id");
    window.history.replaceState(null, "", url);
  }, []);
  const loadShops = useCallback(
    async (
      filter: Brand | null,
      area?: Bounds,
      selectedShopId: string | null = null,
    ) => {
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
        const nextShops = data as Shop[];
        const nextSelected =
          selectedShopId && nextShops.some((shop) => shop.id === selectedShopId)
            ? selectedShopId
            : null;
        setShops(nextShops);
        setSelected(nextSelected);
        syncSelectedShopUrl(nextSelected);
        collapseBrands();
        setDirty(false);
      } catch (e) {
        if (seq === areaSequence.current)
          setError(e instanceof Error ? e.message : "検索できませんでした");
      } finally {
        if (seq === areaSequence.current) setBusy(false);
      }
    },
    [collapseBrands, syncSelectedShopUrl],
  );
  useEffect(() => {
    if (requestedInitialArea.current || !ready) return;
    requestedInitialArea.current = true;
    if (initialShopPosition) {
      searchAtLocation.current = true;
      return;
    }
    const loadDefaultShops = () => {
      if (manualMapFocus.current) {
        setResolvingInitialArea(false);
        return;
      }
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
        if (manualMapFocus.current) {
          setResolvingInitialArea(false);
          return;
        }
        searchAtLocation.current = true;
        setPreserveMapZoom(false);
        setCenter([p.coords.latitude, p.coords.longitude]);
      },
      loadDefaultShops,
      { timeout: 8000, maximumAge: 300000 },
    );
  }, [initialBrand, initialShopPosition, loadShops, ready]);
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
    setSelected(null);
    setQuery("");
    setResults({ brands: [], shops: [] });
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("brand_id", value.id);
    else url.searchParams.delete("brand_id");
    url.searchParams.delete("shop_id");
    window.history.replaceState(null, "", url);
    if (value) revealMobileResults();
    void loadShops(value, value ? undefined : bounds);
  }

  function chooseShop(shop: Shop) {
    manualMapFocus.current = true;
    searchAtLocation.current = false;
    areaSequence.current += 1;
    setBrand(null);
    setQuery("");
    setResults({ brands: [], shops: [] });
    setShops([shop]);
    setBusy(false);
    setResolvingInitialArea(false);
    setDirty(true);
    collapseBrands();
    const url = new URL(window.location.href);
    url.searchParams.delete("brand_id");
    window.history.replaceState(null, "", url);
    selectShop(shop, false);
  }

  function revealMobileResults(
    mode: "at-least-half" | "half" = "at-least-half",
  ) {
    if (!window.matchMedia("(max-width: 800px)").matches) return;
    setMobileSheetSnap((current) =>
      mode === "half" || current === "peek" ? "half" : current,
    );
    window.requestAnimationFrame(() => {
      shopListRef.current?.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
  }

  function selectShop(shop: Shop, preserveZoom = true) {
    setSelected(shop.id);
    syncSelectedShopUrl(shop.id);
    if (
      typeof shop.latitude === "number" &&
      typeof shop.longitude === "number"
    ) {
      setPreserveMapZoom(preserveZoom);
      setCenter([shop.latitude, shop.longitude]);
    }
    revealMobileResults("half");
  }

  function toggleMobileSheet() {
    if (sheetDragMoved.current) {
      sheetDragMoved.current = false;
      return;
    }
    setMobileSheetSnap((current) =>
      current === "full" ? "peek" : nextSheetSnap(current, "up"),
    );
  }

  function startSheetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    sheetDragStart.current = event.clientY;
    sheetDragMoved.current = false;
    setDraggingSheet(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSheetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (sheetDragStart.current === null) return;
    const delta = event.clientY - sheetDragStart.current;
    if (Math.abs(delta) > 6) sheetDragMoved.current = true;
    shopSheetRef.current?.style.setProperty(
      "--shop-sheet-drag-offset",
      `${delta}px`,
    );
  }

  function finishSheetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (sheetDragStart.current === null) return;
    const delta = event.clientY - sheetDragStart.current;
    if (Math.abs(delta) >= 48) {
      setMobileSheetSnap((current) =>
        nextSheetSnap(current, delta < 0 ? "up" : "down"),
      );
      sheetDragMoved.current = true;
    }
    sheetDragStart.current = null;
    setDraggingSheet(false);
    shopSheetRef.current?.style.removeProperty("--shop-sheet-drag-offset");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const sorted = selected
    ? [
        ...shops.filter((s) => s.id === selected),
        ...shops.filter((s) => s.id !== selected),
      ]
    : shops;
  const openCommentShop = shops.find((shop) => shop.id === openComment);
  const openCommentData = openComment ? listComments[openComment] : undefined;

  useEffect(() => {
    if (openComment && !openCommentShop) closeComment();
  }, [closeComment, openComment, openCommentShop]);

  return (
    <main id="main" className={`explore mobile-sheet-${mobileSheetSnap}`}>
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
            {brand && (
              <div className="active-search-filter">
                <button
                  type="button"
                  className="chip"
                  aria-label={`${brand.name}の絞り込みを解除`}
                  onClick={() => chooseBrand(null)}
                >
                  {brand.name}
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}
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
                  <button
                    type="button"
                    className="search-result"
                    key={s.id}
                    aria-label={`${s.name}を地図で表示`}
                    onClick={() => chooseShop(s)}
                  >
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {s.prefecture ?? "地域未登録"}
                        {s.city ? ` ${s.city}` : ""}
                      </small>
                    </span>
                    <MapPin size={18} />
                  </button>
                ))}
                {!results.brands.length && !results.shops.length && (
                  <p className="muted">該当する銘柄・酒屋がありません</p>
                )}
              </div>
            )}
          </div>
          <section
            ref={shopSheetRef}
            className={`shop-sheet shop-sheet-${mobileSheetSnap} ${draggingSheet ? "dragging" : ""}`}
            aria-label="地図内の酒屋一覧"
          >
            <div className="result-heading">
              <div className="result-heading-copy">
                <h2>
                  {brand ? `「${brand.name}」を扱う酒屋` : "地図の酒屋"}{" "}
                  <span className="count">
                    {resolvingInitialArea ? "…" : shops.length}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                className="shop-sheet-toggle"
                aria-controls="map-shop-list"
                aria-expanded={mobileSheetSnap !== "peek"}
                aria-label={
                  mobileSheetSnap === "full"
                    ? "酒屋一覧を小さくする"
                    : "酒屋一覧を広げる"
                }
                onClick={toggleMobileSheet}
                onPointerDown={startSheetDrag}
                onPointerMove={moveSheetDrag}
                onPointerUp={finishSheetDrag}
                onPointerCancel={finishSheetDrag}
              >
                <GripHorizontal
                  className="shop-sheet-grip"
                  size={34}
                  aria-hidden="true"
                />
                <span className="shop-sheet-label">
                  <strong>
                    {brand ? `「${brand.name}」を扱う酒屋` : "地図の酒屋"}
                  </strong>
                  <span className="count">
                    {resolvingInitialArea ? "…" : shops.length}
                  </span>
                </span>
                {mobileSheetSnap === "full" ? (
                  <ChevronDown size={22} aria-hidden="true" />
                ) : (
                  <ChevronUp size={22} aria-hidden="true" />
                )}
              </button>
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div
              ref={shopListRef}
              id="map-shop-list"
              className="shop-list"
              aria-live="polite"
            >
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
                    onCommentToggle={(anchor) =>
                      toggleShopComment(s.id, anchor)
                    }
                    onHighlight={setFocusedShop}
                    onSelect={() => selectShop(s)}
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
              <div className="mobile-map-footer">
                <p>酒が見つかる。店が見つかる。</p>
                <a
                  href="https://sakenowa.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  さけのわデータを利用しています ↗
                </a>
              </div>
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
          </section>
        </aside>
        <section className="map-panel" aria-label="酒屋マップ">
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
                void loadShops(brand, b, selectedRef.current).finally(() =>
                  setResolvingInitialArea(false),
                );
              }
            }}
            center={center}
            preserveZoom={preserveMapZoom}
            mobileSelectionOffsetY={56}
          />
          <div className="map-top">
            <button
              className="icon-button"
              aria-label="現在地に移動"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition(
                  (p) => {
                    setPreserveMapZoom(false);
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
            onClick={() => void loadShops(brand, bounds, selectedRef.current)}
          >
            <Search size={17} />
            {resolvingInitialArea
              ? "現在地を確認しています…"
              : busy
                ? "検索しています…"
                : "このエリアを検索"}
          </button>
        </section>
      </div>
    </main>
  );
}
