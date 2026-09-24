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
  MessageCircle,
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
import { ListingNotice } from "./home/listing-notice";
import { useShopMetadata } from "./home/use-shop-metadata";
import { useToast } from "./toast-provider";
import { mapAwareShopPath, mapReturnPath, type MapView } from "@/lib/map-view";
import { mapBoundsCenter, visibleShopList } from "@/lib/shop-order";
import type { Brand, Bounds, Shop } from "@/lib/types";

type MobileSheetSnap = "peek" | "half" | "full";
const shopsPerPage = 20;
const searchShopsPerPage = 10;

type SearchResults = {
  brands: Brand[];
  shops: Shop[];
  shopsHasMore: boolean;
};

const emptySearchResults = (): SearchResults => ({
  brands: [],
  shops: [],
  shopsHasMore: false,
});

function searchRequestParams(
  query: string,
  origin: [number, number] | undefined,
  offset = 0,
) {
  const params = new URLSearchParams({
    q: query,
    shop_limit: String(searchShopsPerPage),
    shop_offset: String(offset),
  });
  if (origin) {
    params.set("latitude", String(origin[0]));
    params.set("longitude", String(origin[1]));
  }
  return params;
}

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
  initialMapView,
  initialError,
}: {
  ready: boolean;
  initialBrand: Brand | null;
  initialShop: Shop | null;
  initialMapView?: MapView;
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
  const [hideSearchResults, setHideSearchResults] = useState(false);
  const [results, setResults] = useState<SearchResults>(emptySearchResults);
  const [brand, setBrand] = useState<Brand | null>(initialBrand);
  const [selected, setSelected] = useState<string | null>(
    initialShopPosition ? (initialShop?.id ?? null) : null,
  );
  const [focusedShop, setFocusedShop] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds>();
  const [center, setCenter] = useState<[number, number] | undefined>(
    initialMapView?.center ?? initialShopPosition,
  );
  const [userLocation, setUserLocation] = useState<
    [number, number] | undefined
  >();
  const [preserveMapZoom, setPreserveMapZoom] = useState(
    Boolean(initialMapView),
  );
  const [mapView, setMapView] = useState<MapView | undefined>(initialMapView);
  const [shopListCenter, setShopListCenter] = useState<
    [number, number] | undefined
  >(initialMapView?.center ?? initialShopPosition);
  const [visibleShopLimit, setVisibleShopLimit] = useState(shopsPerPage);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMoreSearchShops, setLoadingMoreSearchShops] = useState(false);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shopSheetRef = useRef<HTMLElement>(null);
  const sheetDragStart = useRef<number | null>(null);
  const sheetDragMoved = useRef(false);
  const visibleShops = useMemo(
    () => visibleShopList(shops, shopListCenter, selected, visibleShopLimit),
    [selected, shopListCenter, shops, visibleShopLimit],
  );
  const searchOrigin = userLocation ?? mapView?.center ?? center;
  const searchLatitude = searchOrigin?.[0];
  const searchLongitude = searchOrigin?.[1];
  const commentShops = useMemo(() => {
    const uniqueShops = new globalThis.Map<string, Shop>();
    for (const shop of [...visibleShops, ...results.shops])
      uniqueShops.set(shop.id, shop);
    return [...uniqueShops.values()];
  }, [results.shops, visibleShops]);
  const {
    allBrands: allListBrands,
    brandTotals: shopBrandTotals,
    brandPreviews: listBrands,
    collapseBrands,
    expandedShopId: expandedBrandShop,
    commentSummaries: listCommentSummaries,
    loadingShopId: loadingBrandShop,
    toggleBrands: toggleShopBrands,
  } = useShopMetadata(visibleShops, shops, setError, commentShops);
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
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const loadShops = useCallback(
    async (
      filter: Brand | null,
      area?: Bounds,
      selectedShopId: string | null = null,
      listCenter?: [number, number],
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
        setVisibleShopLimit(shopsPerPage);
        setShops(nextShops);
        setShopListCenter(
          listCenter ?? (area ? mapBoundsCenter(area) : undefined),
        );
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
      void loadShops(
        initialBrand,
        undefined,
        null,
        initialMapView?.center,
      ).finally(() => setResolvingInitialArea(false));
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
        const location: [number, number] = [
          p.coords.latitude,
          p.coords.longitude,
        ];
        setUserLocation(location);
        setCenter(location);
      },
      loadDefaultShops,
      { timeout: 8000, maximumAge: 300000 },
    );
  }, [initialBrand, initialShopPosition, loadShops, ready]);
  useEffect(() => {
    const seq = ++searchSequence.current;
    setLoadingMoreSearchShops(false);
    if (!query.trim()) {
      setResults((current) =>
        current.brands.length || current.shops.length || current.shopsHasMore
          ? emptySearchResults()
          : current,
      );
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const origin =
          searchLatitude !== undefined && searchLongitude !== undefined
            ? ([searchLatitude, searchLongitude] as [number, number])
            : undefined;
        const r = await fetch(
          "/api/search?" + searchRequestParams(query.trim(), origin),
          { signal: abort.signal },
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (seq === searchSequence.current)
          setResults({
            brands: data.brands ?? [],
            shops: data.shops ?? [],
            shopsHasMore: Boolean(data.shopsHasMore),
          });
      } catch (e) {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "検索できませんでした");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, searchLatitude, searchLongitude]);

  async function loadMoreSearchShops() {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || loadingMoreSearchShops) return;
    const seq = searchSequence.current;
    setLoadingMoreSearchShops(true);
    try {
      const r = await fetch(
        "/api/search?" +
          searchRequestParams(
            normalizedQuery,
            searchOrigin,
            results.shops.length,
          ) +
          "&scope=shops",
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (seq !== searchSequence.current) return;
      setResults((current) => {
        const knownIds = new Set(current.shops.map((shop) => shop.id));
        const additionalShops = (data.shops as Shop[]).filter(
          (shop) => !knownIds.has(shop.id),
        );
        return {
          ...current,
          shops: [...current.shops, ...additionalShops],
          shopsHasMore: Boolean(data.shopsHasMore),
        };
      });
    } catch (e) {
      if (seq === searchSequence.current)
        setError(e instanceof Error ? e.message : "検索できませんでした");
    } finally {
      if (seq === searchSequence.current) setLoadingMoreSearchShops(false);
    }
  }
  function chooseBrand(value: Brand | null) {
    setBrand(value);
    setSelected(null);
    setQuery("");
    setResults(emptySearchResults());
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("brand_id", value.id);
    else url.searchParams.delete("brand_id");
    url.searchParams.delete("shop_id");
    window.history.replaceState(window.history.state, "", url);
    if (value) revealMobileResults();
    void loadShops(
      value,
      value ? undefined : bounds,
      null,
      mapView?.center ?? center,
    );
  }

  function chooseBrandFromShop(value: Brand) {
    chooseBrand(value);
    setQuery(value.name);
    setHideSearchResults(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function chooseShop(shop: Shop) {
    manualMapFocus.current = true;
    searchAtLocation.current = false;
    areaSequence.current += 1;
    setBrand(null);
    setQuery("");
    setResults(emptySearchResults());
    setShops([shop]);
    setShopListCenter(
      typeof shop.latitude === "number" && typeof shop.longitude === "number"
        ? [shop.latitude, shop.longitude]
        : undefined,
    );
    setBusy(false);
    setResolvingInitialArea(false);
    setDirty(true);
    collapseBrands();
    const url = new URL(window.location.href);
    url.searchParams.delete("brand_id");
    window.history.replaceState(window.history.state, "", url);
    selectShop(shop, false, true);
  }

  function scrollShopListToTop() {
    window.requestAnimationFrame(() => {
      shopListRef.current?.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
  }

  function revealMobileResults(
    mode: "at-least-half" | "half" = "at-least-half",
    scrollToTop = true,
  ) {
    if (!window.matchMedia("(max-width: 800px)").matches) return;
    setMobileSheetSnap((current) =>
      mode === "half" || current === "peek" ? "half" : current,
    );
    if (scrollToTop) scrollShopListToTop();
  }

  function selectShop(
    shop: Shop,
    preserveZoom = true,
    scrollListToTop = false,
    recenter = true,
  ) {
    setSelected(shop.id);
    syncSelectedShopUrl(shop.id);
    if (
      recenter &&
      typeof shop.latitude === "number" &&
      typeof shop.longitude === "number"
    ) {
      setPreserveMapZoom(preserveZoom);
      setCenter([shop.latitude, shop.longitude]);
    }
    revealMobileResults("half", false);
    if (scrollListToTop) scrollShopListToTop();
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
  const openCommentShop = commentShops.find((shop) => shop.id === openComment);
  const openCommentSummary = openComment
    ? listCommentSummaries[openComment]
    : undefined;
  const returnPathForShop = useCallback(
    (shopId: string) =>
      mapReturnPath({ brandId: brand?.id, shopId, view: mapView }),
    [brand?.id, mapView],
  );
  const shopPagePath = useCallback(
    (shopId: string) => mapAwareShopPath(shopId, returnPathForShop(shopId)),
    [returnPathForShop],
  );
  const prepareShopNavigation = useCallback(
    (shopId: string) =>
      window.history.replaceState(
        window.history.state,
        "",
        returnPathForShop(shopId),
      ),
    [returnPathForShop],
  );

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
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => {
                    setHideSearchResults(false);
                    setQuery(e.target.value);
                  }}
                  placeholder="銘柄・酒屋を検索"
                  aria-label="銘柄・酒屋を検索"
                />
                {query && (
                  <button
                    onClick={() => {
                      setHideSearchResults(false);
                      setQuery("");
                    }}
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
            {query.trim() && !hideSearchResults && (
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
                <h3 className="search-results-heading">
                  <span>酒屋</span>
                  <span className="search-result-summary">
                    {results.shops.length}
                    {results.shopsHasMore ? "件以上" : "件"}
                    {searchOrigin
                      ? userLocation
                        ? "・現在地に近い順"
                        : "・地図の中心に近い順"
                      : ""}
                  </span>
                </h3>
                {results.shops.map((s) => {
                  const commentSummary = listCommentSummaries[s.id];
                  const commentCount = commentSummary?.total ?? 0;
                  const commentOpen = openComment === s.id;
                  return (
                    <div
                      className="search-result search-shop-result"
                      key={s.id}
                    >
                      <button
                        type="button"
                        className="search-result-select"
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
                      </button>
                      <button
                        type="button"
                        data-comment-trigger
                        className={`shop-comment-trigger search-comment-trigger${commentOpen ? " active" : ""}`}
                        aria-label={`${s.name}のコメント${commentCount}件を表示`}
                        aria-expanded={commentOpen}
                        aria-controls={
                          commentOpen ? "latest-shop-comment" : undefined
                        }
                        onClick={(event) =>
                          toggleShopComment(s.id, event.currentTarget)
                        }
                      >
                        <MessageCircle
                          size={18}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        {commentCount > 0 && (
                          <span
                            className="shop-comment-count"
                            aria-hidden="true"
                          >
                            {commentCount}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
                {results.shopsHasMore && (
                  <div className="search-results-more">
                    <button
                      type="button"
                      className="button ghost small"
                      disabled={loadingMoreSearchShops}
                      onClick={() => void loadMoreSearchShops()}
                    >
                      {loadingMoreSearchShops
                        ? "読み込んでいます…"
                        : "酒屋をもっと見る"}
                    </button>
                  </div>
                )}
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
                    {resolvingInitialArea
                      ? "…"
                      : visibleShops.length < shops.length
                        ? `${visibleShops.length}/${shops.length}`
                        : shops.length}
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
                    {resolvingInitialArea
                      ? "…"
                      : visibleShops.length < shops.length
                        ? `${visibleShops.length}/${shops.length}`
                        : shops.length}
                  </span>
                </span>
                {mobileSheetSnap === "full" ? (
                  <ChevronDown size={22} aria-hidden="true" />
                ) : (
                  <ChevronUp size={22} aria-hidden="true" />
                )}
              </button>
              <ListingNotice />
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
              {visibleShops.map((s) => {
                const commentSummary = listCommentSummaries[s.id];
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
                    commentCount={commentSummary?.total ?? 0}
                    expanded={expanded}
                    loading={loadingBrandShop === s.id}
                    onBrandSelect={chooseBrandFromShop}
                    onCommentToggle={(anchor) =>
                      toggleShopComment(s.id, anchor)
                    }
                    onHighlight={setFocusedShop}
                    onSelect={() => selectShop(s)}
                    onShopNavigate={() => prepareShopNavigation(s.id)}
                    onToggleBrands={() => void toggleShopBrands(s.id)}
                    preview={preview}
                    selected={selected === s.id}
                    shop={s}
                    shopHref={shopPagePath(s.id)}
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
              {visibleShops.length < shops.length && (
                <div className="shop-list-more">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() =>
                      setVisibleShopLimit((current) => current + shopsPerPage)
                    }
                  >
                    もっと表示（残り{shops.length - visibleShops.length}店）
                  </button>
                </div>
              )}
              <div className="mobile-map-footer">
                <p>みんなで作る酒屋マップ</p>
              </div>
            </div>
            {openComment &&
              openCommentShop &&
              commentPopoverPosition &&
              openCommentSummary && (
                <ShopCommentPopover
                  key={openComment}
                  initialComment={openCommentSummary.latest}
                  initialTotal={openCommentSummary.total}
                  onClose={closeComment}
                  popoverRef={commentPreviewRef}
                  position={commentPopoverPosition}
                  shopHref={`${shopPagePath(openComment)}#comments`}
                  shopId={openComment}
                  onShopNavigate={() => prepareShopNavigation(openComment)}
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
            brandTotals={shopBrandTotals}
            selected={selected}
            highlighted={focusedShop}
            onSelect={(id) => {
              const shop = shops.find((item) => item.id === id);
              if (shop) selectShop(shop, true, true, false);
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
            initialZoom={initialMapView?.zoom}
            onViewChange={setMapView}
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
                    const location: [number, number] = [
                      p.coords.latitude,
                      p.coords.longitude,
                    ];
                    setPreserveMapZoom(false);
                    setUserLocation(location);
                    setCenter(location);
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
