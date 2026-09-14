import type { Brand } from "@/lib/types";
import type { ShopBrandPreview } from "./use-shop-metadata";

export function ShopBrandTags({
  brands,
  expanded,
  loading,
  onToggle,
  preview,
  shopId,
  variant,
}: {
  brands?: Brand[];
  expanded: boolean;
  loading: boolean;
  onToggle: () => void;
  preview?: ShopBrandPreview;
  shopId: string;
  variant: "list" | "map";
}) {
  const contentId = `${variant}-shop-brands-${shopId}`;
  if (!brands?.length)
    return preview ? (
      <span
        className={variant === "map" ? "map-shop-empty" : "shop-card-empty"}
      >
        取扱銘柄は未登録
      </span>
    ) : null;

  return (
    <div
      className={variant === "map" ? "map-shop-brands" : "shop-card-brands"}
      id={contentId}
    >
      {brands.map((brand) => (
        <span className="shop-card-brand" key={brand.id}>
          {brand.name}
        </span>
      ))}
      {preview && preview.total > 10 && (
        <button
          type="button"
          className="shop-card-more"
          disabled={loading}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={onToggle}
        >
          {loading
            ? "読み込み中…"
            : expanded
              ? "閉じる"
              : `ほか${preview.total - 10}銘柄`}
        </button>
      )}
    </div>
  );
}
