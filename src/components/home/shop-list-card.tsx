import Link from "next/link";
import { ChevronRight, MessageCircle, Store } from "lucide-react";
import type { Brand, Shop } from "@/lib/types";
import { ShopBrandTags } from "./shop-brand-tags";
import type { ShopBrandPreview } from "./use-shop-metadata";

export function ShopListCard({
  brands,
  commentOpen,
  expanded,
  commentCount,
  loading,
  onCommentToggle,
  onHighlight,
  onSelect,
  onShopNavigate,
  onToggleBrands,
  preview,
  selected,
  shop,
  shopHref,
}: {
  brands?: Brand[];
  commentOpen: boolean;
  expanded: boolean;
  commentCount: number;
  loading: boolean;
  onCommentToggle: (anchor: HTMLElement) => void;
  onHighlight: (shopId: string | null) => void;
  onSelect: () => void;
  onShopNavigate: () => void;
  onToggleBrands: () => void;
  preview?: ShopBrandPreview;
  selected: boolean;
  shop: Shop;
  shopHref: string;
}) {
  return (
    <div
      className={"shop-card " + (selected ? "active" : "")}
      onMouseEnter={() => onHighlight(shop.id)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(shop.id)}
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          onHighlight(null);
      }}
    >
      <button
        type="button"
        className="shop-card-select"
        aria-label={`${shop.name}を地図で選択`}
        aria-pressed={selected}
        onClick={onSelect}
      />
      <div className="shop-card-head">
        <div className="shop-card-main">
          <Store size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="shop-card-copy">
            <h3>{shop.name}</h3>
          </span>
        </div>
        <div className="shop-card-actions">
          <button
            type="button"
            data-comment-trigger
            className={"shop-comment-trigger " + (commentOpen ? "active" : "")}
            aria-label={`${shop.name}のコメント${commentCount}件を表示`}
            aria-expanded={commentOpen}
            aria-controls={commentOpen ? "latest-shop-comment" : undefined}
            onClick={(event) => onCommentToggle(event.currentTarget)}
          >
            <MessageCircle size={18} strokeWidth={1.8} aria-hidden="true" />
            {commentCount > 0 && (
              <span className="shop-comment-count" aria-hidden="true">
                {commentCount}
              </span>
            )}
          </button>
          <Link
            className="shop-page-link"
            href={shopHref}
            aria-label={`${shop.name}の詳細を見る`}
            onClick={onSelect}
            onNavigate={onShopNavigate}
          >
            詳しく見る
            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <ShopBrandTags
        brands={brands}
        expanded={expanded}
        loading={loading}
        onToggle={onToggleBrands}
        preview={preview}
        shopId={shop.id}
      />
    </div>
  );
}
