"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search, X } from "lucide-react";
import { KanaEditDialog } from "@/components/kana-edit-dialog";
import { useToast } from "@/components/toast-provider";
import type { Brand, Brewery, EntityType, Shop } from "@/lib/types";

type SearchItem = Brand | Brewery | Shop;
type KanaTarget = "brand" | "brewery";
type SelectedKanaItem = {
  item: Brand | Brewery;
  label: string;
  type: KanaTarget;
};

const targets: Array<{ type: EntityType; label: string }> = [
  { type: "brand", label: "銘柄" },
  { type: "brewery", label: "酒蔵" },
  { type: "shop", label: "酒屋" },
];

function resultDetails(type: EntityType, item: SearchItem) {
  const kana = item.name_kana?.trim();
  const location =
    type === "brand"
      ? [
          (item as Brand).brewery_name ?? "酒蔵未登録",
          (item as Brand).prefecture,
        ]
          .filter(Boolean)
          .join("・")
      : type === "brewery"
        ? (item as Brewery).prefecture
        : [(item as Shop).prefecture, (item as Shop).city]
            .filter(Boolean)
            .join(" ");

  return (
    <>
      <span className={`edit-result-kana${kana ? "" : " missing"}`}>
        {kana || "かな未登録"}
      </span>
      {location && <span className="edit-result-meta">{location}</span>}
    </>
  );
}

export function EditSearch({
  admin = false,
  signedIn = false,
  initialTarget = "brand",
  initialQuery = "",
}: {
  admin?: boolean;
  signedIn?: boolean;
  initialTarget?: EntityType;
  initialQuery?: string;
}) {
  const { showToast } = useToast();
  const [target, setTarget] = useState<EntityType>(initialTarget);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SelectedKanaItem | null>(null);
  const targetLabel =
    targets.find(({ type }) => type === target)?.label ?? "登録情報";
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (!normalizedQuery) {
      setResults([]);
      setBusy(false);
      setError("");
      return;
    }

    const abort = new AbortController();
    setResults([]);
    setBusy(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const endpoint =
          target === "brewery"
            ? `/api/breweries?q=${encodeURIComponent(normalizedQuery)}`
            : `/api/search?scope=${target === "brand" ? "brands" : "shops"}&q=${encodeURIComponent(normalizedQuery)}`;
        const response = await fetch(endpoint, { signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "検索できませんでした");
        const items =
          target === "brewery"
            ? data
            : data[target === "brand" ? "brands" : "shops"];
        setResults(Array.isArray(items) ? items : []);
      } catch (reason) {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "検索できませんでした",
          );
      } finally {
        if (!abort.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [normalizedQuery, target]);

  function openQuickEdit(item: SearchItem) {
    if (target === "shop") return;
    setSelected({
      item: item as Brand | Brewery,
      label: targetLabel,
      type: target,
    });
  }

  const closeQuickEdit = useCallback(() => setSelected(null), []);

  return (
    <div className="card edit-search-card">
      <div className="edit-type-switch" aria-label="編集対象">
        {targets.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            aria-pressed={target === type}
            onClick={() => {
              setTarget(type);
              setSelected(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="edit-search-field">
        <span>{targetLabel}を検索</span>
        <span className="searchbox">
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder={`${targetLabel}名・かな`}
          />
          {query && (
            <button
              type="button"
              aria-label="検索をクリア"
              onClick={() => {
                setQuery("");
              }}
            >
              <X size={18} />
            </button>
          )}
        </span>
      </label>

      <div className="edit-results-heading">
        <h2>{targetLabel}の検索結果</h2>
        <div className="edit-results-actions">
          {normalizedQuery && !busy && (
            <span className="edit-result-count" aria-live="polite">
              {results.length}件
            </span>
          )}
          {target === "shop" && (
            <Link className="button small" href="/edit/shop/new">
              <Plus size={17} />
              新規登録
            </Link>
          )}
        </div>
      </div>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!normalizedQuery && (
        <p className="edit-search-empty">
          {targetLabel}の検索結果を表示します。
        </p>
      )}
      {busy && (
        <p className="edit-search-empty" role="status">
          検索しています…
        </p>
      )}
      {!busy && normalizedQuery && !error && results.length === 0 && (
        <p className="edit-search-empty">
          条件に合う{targetLabel}が見つかりませんでした。
        </p>
      )}
      {!busy && results.length > 0 && (
        <div className="edit-result-list">
          {results.map((item) => {
            const content = (
              <>
                <span className="edit-result-copy">
                  <strong>{item.name}</strong>
                  {resultDetails(target, item)}
                </span>
                {(target === "shop" || signedIn) && (
                  <span className="edit-result-action">
                    {target === "shop" ? "編集" : "かなを編集"}
                    <ChevronRight size={18} />
                  </span>
                )}
              </>
            );
            return target !== "shop" && signedIn ? (
              <button
                className="edit-result"
                key={item.id}
                type="button"
                onClick={() => openQuickEdit(item)}
              >
                {content}
              </button>
            ) : target === "shop" ? (
              <Link
                className="edit-result"
                key={item.id}
                href={`/edit/${target}/${item.id}?return_to=${encodeURIComponent(
                  `/edit?type=shop&q=${encodeURIComponent(normalizedQuery)}`,
                )}`}
              >
                {content}
              </Link>
            ) : (
              <div className="edit-result" key={item.id}>
                {content}
              </div>
            );
          })}
        </div>
      )}

      {!admin && signedIn && (
        <p className="notice master-source-note">
          銘柄と酒蔵は、かなのみ編集できます。名称・酒蔵の紐付けなどは、さけのわデータを利用しています。
        </p>
      )}
      {!signedIn && (
        <p className="notice master-source-note">
          銘柄と酒蔵のかなは、どなたでも確認できます。編集するにはログインしてください。
        </p>
      )}

      {selected && (
        <KanaEditDialog
          key={selected.item.id}
          admin={admin}
          item={selected.item}
          label={selected.label}
          type={selected.type}
          onClose={closeQuickEdit}
          onSaved={(id, nameKana) => {
            setResults((current) =>
              current.map((item) =>
                item.id === id ? { ...item, name_kana: nameKana } : item,
              ),
            );
            showToast(`${selected.item.name}のかなを保存しました`);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
