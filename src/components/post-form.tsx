"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { mutate } from "@/lib/client";
import {
  brandPrefecture,
  matchesBrandFilters,
  matchesBrandQuery,
  sortBrands,
  type BrandCatalogSort,
  type BrandFilterTarget,
  type KanaGroup,
} from "@/lib/brand-index";
import type { Brand, Shop, ShopBrand, ShopBrandStatus } from "@/lib/types";
import { BrandFilterControls } from "./brand-filter-controls";

const statusLabels: Record<ShopBrandStatus, string> = {
  available: "取扱あり",
  unavailable: "現在は取扱なし",
  incorrect: "誤った取扱情報",
};

function breweryName(brand: Brand) {
  return brand.breweries?.name ?? brand.brewery_name ?? "酒蔵未登録";
}

export function PostForm({
  shop,
  shopRelations,
}: {
  shop: Shop;
  shopRelations: ShopBrand[];
}) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<Brand[]>([]);
  const [selectedPrefectures, setSelectedPrefectures] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTargets, setSelectedTargets] = useState<
    Set<BrandFilterTarget>
  >(() => new Set(["brand", "brewery"]));
  const [selectedKana, setSelectedKana] = useState<Set<KanaGroup>>(new Set());
  const [sort, setSort] = useState<BrandCatalogSort>("brand");
  const [catalogBusy, setCatalogBusy] = useState(true);
  const [working, setWorking] = useState<Set<string>>(new Set());
  const [relationStatuses, setRelationStatuses] = useState(
    () =>
      new Map<string, ShopBrandStatus>(
        shopRelations.map((relation) => [relation.brand_id, relation.status]),
      ),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestBrewery, setRequestBrewery] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/brands?all=1", {
          signal: abort.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setCatalog(data);
        setError("");
      } catch (reason) {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "銘柄一覧を取得できませんでした",
          );
      } finally {
        if (!abort.signal.aborted) setCatalogBusy(false);
      }
    })();
    return () => abort.abort();
  }, []);

  const isBrowsingCatalog =
    query.trim().length > 0 ||
    selectedPrefectures.size > 0 ||
    selectedKana.size > 0;

  const visibleBrands = useMemo(() => {
    const source = isBrowsingCatalog
      ? catalog
      : catalog.filter(
          (brand) =>
            relationStatuses.has(brand.id) &&
            relationStatuses.get(brand.id) !== "incorrect",
        );
    const filtered = source.filter(
      (brand) =>
        matchesBrandQuery(brand, query) &&
        matchesBrandFilters(
          brand,
          selectedPrefectures,
          selectedTargets,
          selectedKana,
        ),
    );
    if (sort === "recent") {
      const relationOrder = new Map(
        shopRelations.map((relation, index) => [relation.brand_id, index]),
      );
      return [...filtered].sort((a, b) => {
        const aOrder = relationOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = relationOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
    }
    return sortBrands(filtered, sort);
  }, [
    catalog,
    isBrowsingCatalog,
    query,
    relationStatuses,
    selectedKana,
    selectedPrefectures,
    selectedTargets,
    shopRelations,
    sort,
  ]);

  const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase();
  const hasExactMatch = catalog.some(
    (brand) =>
      brand.name.normalize("NFKC").toLocaleLowerCase() === normalizedQuery,
  );

  async function addBrand(brand: Brand) {
    if (working.has(brand.id)) return;
    setWorking((current) => new Set(current).add(brand.id));
    setError("");
    setMessage("");
    try {
      await mutate({
        kind: "shop_brand_status",
        shop_id: shop.id,
        brand_id: brand.id,
        status: "available",
        reason: null,
      });
      setRelationStatuses((current) => {
        const next = new Map(current);
        next.set(brand.id, "available");
        return next;
      });
      setMessage(`${brand.name}を「取扱あり」にしました`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "追加できませんでした",
      );
    } finally {
      setWorking((current) => {
        const next = new Set(current);
        next.delete(brand.id);
        return next;
      });
    }
  }

  async function changeStatus(brand: Brand, nextStatus: ShopBrandStatus) {
    const previous = relationStatuses.get(brand.id);
    if (!previous || previous === nextStatus || working.has(brand.id)) return;
    setWorking((current) => new Set(current).add(brand.id));
    setError("");
    setMessage("");
    try {
      await mutate({
        kind: "shop_brand_status",
        shop_id: shop.id,
        brand_id: brand.id,
        status: nextStatus,
        reason: null,
      });
      setRelationStatuses((current) => {
        const next = new Map(current);
        next.set(brand.id, nextStatus);
        return next;
      });
      setMessage(
        `${brand.name}を「${statusLabels[nextStatus]}」に変更しました`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "取扱状況を変更できませんでした",
      );
    } finally {
      setWorking((current) => {
        const next = new Set(current);
        next.delete(brand.id);
        return next;
      });
    }
  }

  async function submitMissingBrand() {
    if (!query.trim()) return;
    setRequestBusy(true);
    setError("");
    setMessage("");
    try {
      await mutate({
        kind: "brand_request",
        name: query.trim(),
        brewery_name: requestBrewery.trim() || null,
        note: requestNote.trim() || null,
        shop_id: shop.id,
      });
      setRequestOpen(false);
      setRequestBrewery("");
      setRequestNote("");
      setMessage(`「${query.trim()}」が見つからないことを送信しました`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "報告を送信できませんでした",
      );
    } finally {
      setRequestBusy(false);
    }
  }

  return (
    <div className="quick-post">
      <label className="searchbox brand-search">
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setRequestOpen(false);
          }}
          placeholder="銘柄名・酒蔵名・かなで検索"
          aria-label="銘柄名・酒蔵名・かなで検索"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="検索をクリア"
          >
            <X size={18} />
          </button>
        )}
      </label>

      <BrandFilterControls
        selectedPrefectures={selectedPrefectures}
        onPrefecturesChange={setSelectedPrefectures}
        selectedTargets={selectedTargets}
        onTargetsChange={setSelectedTargets}
        selectedKana={selectedKana}
        onKanaChange={setSelectedKana}
        sort={sort}
        onSortChange={setSort}
        visibleCount={visibleBrands.length}
        totalCount={catalog.length}
        sortOptions={[
          ["brand", "銘柄順"],
          ["brewery", "蔵元順"],
          ["region", "県順"],
        ]}
      />

      <div className="brand-options" aria-live="polite">
        <div className="brand-options-title">
          {isBrowsingCatalog
            ? "全銘柄からの絞り込み結果"
            : "この酒屋の取扱情報"}
        </div>
        {visibleBrands.map((brand) => {
          const isWorking = working.has(brand.id);
          const relationStatus = relationStatuses.get(brand.id);
          const resolvedBreweryName = breweryName(brand);
          const prefecture = brandPrefecture(brand);
          return (
            <div className="brand-option" key={brand.id}>
              <span>
                <span className="brand-option-meta">
                  {resolvedBreweryName === "酒蔵未登録" ? (
                    <span>{resolvedBreweryName}</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`${resolvedBreweryName}の銘柄に絞り込む`}
                      onClick={() => {
                        setQuery(resolvedBreweryName);
                        setRequestOpen(false);
                      }}
                    >
                      {resolvedBreweryName}
                    </button>
                  )}
                  {prefecture && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        aria-label={`${prefecture}で絞り込む`}
                        onClick={() =>
                          setSelectedPrefectures(new Set([prefecture]))
                        }
                      >
                        {prefecture}
                      </button>
                    </>
                  )}
                </span>
                <strong>{brand.name}</strong>
              </span>
              {relationStatus ? (
                <label className="brand-status-select">
                  <span className="sr-only">{brand.name}の取扱状況</span>
                  <select
                    value={relationStatus}
                    disabled={isWorking}
                    onChange={(event) =>
                      void changeStatus(
                        brand,
                        event.target.value as ShopBrandStatus,
                      )
                    }
                  >
                    <option value="available">取扱あり</option>
                    <option value="unavailable">現在は取扱なし</option>
                    <option value="incorrect">誤った取扱情報</option>
                  </select>
                </label>
              ) : (
                <button
                  type="button"
                  className="quick-add"
                  disabled={isWorking}
                  onClick={() => void addBrand(brand)}
                  aria-label={`${brand.name}を取扱ありとして追加`}
                >
                  <Plus size={20} />
                </button>
              )}
            </div>
          );
        })}
        {catalogBusy && <p className="brand-status">読み込んでいます…</p>}
        {!catalogBusy && visibleBrands.length === 0 && (
          <p className="brand-status">
            {isBrowsingCatalog
              ? "条件に合う銘柄がありません"
              : "取扱情報はありません。検索または都道府県・かなを選んで追加してください。"}
          </p>
        )}
      </div>

      {query.trim() && !hasExactMatch && (
        <div className="missing-brand">
          <p>
            商品名ではなく銘柄名で検索しても見つからない場合は、お知らせください。
          </p>
          {!requestOpen ? (
            <button
              type="button"
              className="text-link"
              onClick={() => setRequestOpen(true)}
            >
              「{query.trim()}」が見つからないことを知らせる
            </button>
          ) : (
            <form
              className="form-stack missing-brand-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitMissingBrand();
              }}
            >
              <label>
                酒蔵名 <span className="muted">任意</span>
                <input
                  value={requestBrewery}
                  onChange={(event) => setRequestBrewery(event.target.value)}
                  maxLength={150}
                />
              </label>
              <label>
                補足 <span className="muted">任意</span>
                <textarea
                  value={requestNote}
                  onChange={(event) => setRequestNote(event.target.value)}
                  maxLength={500}
                  placeholder="表記や読み方など"
                />
              </label>
              <div className="actions">
                <button className="button small" disabled={requestBusy}>
                  {requestBusy ? "送信しています…" : "送信"}
                </button>
                <button type="button" onClick={() => setRequestOpen(false)}>
                  キャンセル
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {message && <p className="quick-post-status">{message}</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
