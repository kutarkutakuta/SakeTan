import Link from "next/link";
import { MessageCircle, X } from "lucide-react";
import type { Brand, LatestShopComment, Shop } from "@/lib/types";
import { ShopBrandTags } from "./shop-brand-tags";
import type { ShopBrandPreview } from "./use-shop-metadata";

export function MapShopCard({
  brands,
  commentOpen,
  expanded,
  latestComment,
  loading,
  onClose,
  onCommentToggle,
  onToggleBrands,
  preview,
  shop,
}: {
  brands?: Brand[];
  commentOpen: boolean;
  expanded: boolean;
  latestComment?: LatestShopComment;
  loading: boolean;
  onClose: () => void;
  onCommentToggle: (anchor: HTMLElement) => void;
  onToggleBrands: () => void;
  preview?: ShopBrandPreview;
  shop: Shop;
}) {
  return (
    <section
      className={"map-shop-card " + (expanded ? "expanded" : "")}
      aria-label={`${shop.name}の情報`}
    >
      <Link
        className="map-shop-card-link"
        href={`/shops/${shop.id}`}
        aria-label={`${shop.name}の店舗ページへ`}
      />
      <div className="map-shop-card-head">
        <strong>{shop.name}</strong>
        {latestComment && (
          <button
            type="button"
            data-comment-trigger
            className={
              "map-shop-card-action map-shop-comment-trigger " +
              (commentOpen ? "active" : "")
            }
            aria-label={`${shop.name}の最新コメントを表示`}
            aria-expanded={commentOpen}
            aria-controls={commentOpen ? "latest-shop-comment" : undefined}
            onClick={(event) => onCommentToggle(event.currentTarget)}
          >
            <MessageCircle size={17} strokeWidth={1.8} />
          </button>
        )}
        <button
          type="button"
          className="map-shop-card-action map-shop-close"
          aria-label={`${shop.name}の選択を閉じる`}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <ShopBrandTags
        brands={brands}
        expanded={expanded}
        loading={loading}
        onToggle={onToggleBrands}
        preview={preview}
        shopId={shop.id}
        variant="map"
      />
    </section>
  );
}
