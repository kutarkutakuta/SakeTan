import Link from "next/link";
import { MessageCircle, Store } from "lucide-react";
import type { Brand, LatestShopComment, Shop } from "@/lib/types";
import { ShopBrandTags } from "./shop-brand-tags";
import type { ShopBrandPreview } from "./use-shop-metadata";

export function ShopListCard({
  brands,
  commentOpen,
  expanded,
  latestComment,
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
  latestComment?: LatestShopComment;
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
          {latestComment && (
            <button
              type="button"
              data-comment-trigger
              className={
                "shop-comment-trigger " + (commentOpen ? "active" : "")
              }
              aria-label={`${shop.name}の最新コメントを表示`}
              aria-expanded={commentOpen}
              aria-controls={commentOpen ? "latest-shop-comment" : undefined}
              onClick={(event) => onCommentToggle(event.currentTarget)}
            >
              <MessageCircle size={17} strokeWidth={1.8} />
            </button>
          )}
          <Link
            className="shop-page-link"
            href={shopHref}
            aria-label={`${shop.name}の店舗ページへ`}
            onClick={onSelect}
            onNavigate={onShopNavigate}
          >
            店舗ページへ
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
        variant="list"
      />
    </div>
  );
}
