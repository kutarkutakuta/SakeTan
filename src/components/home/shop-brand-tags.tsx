import type { Brand } from "@/lib/types";
import { shopBrandRankingLabel } from "@/lib/shop-brand-order";
import type { ShopBrandPreview } from "./use-shop-metadata";

export function ShopBrandTags({
  brands,
  expanded,
  loading,
  onBrandSelect,
  onToggle,
  preview,
  shopId,
}: {
  brands?: Brand[];
  expanded: boolean;
  loading: boolean;
  onBrandSelect: (brand: Brand) => void;
  onToggle: () => void;
  preview?: ShopBrandPreview;
  shopId: string;
}) {
  const contentId = `shop-brands-${shopId}`;
  if (!brands?.length)
    return preview ? (
      <span className="shop-card-empty">取扱銘柄は未登録</span>
    ) : null;

  return (
    <div className="shop-card-brands" id={contentId}>
      {brands.map((brand) => {
        const pending = brand.registration_status === "pending";
        const ranking = shopBrandRankingLabel(brand);
        return (
          <button
            type="button"
            className={`shop-card-brand${pending ? " has-pending" : ""}${ranking ? (brand.sakenowa_rank != null ? " is-national-ranked" : " is-regional-ranked") : ""}`}
            key={brand.id}
            onClick={() => onBrandSelect(brand)}
            title={ranking ?? undefined}
            aria-label={`${brand.name}${pending ? "（申請中）" : ""}${ranking ? `（${ranking}）` : ""}で絞り込む`}
          >
            {brand.name}
            {pending && (
              <span
                className="pending-triangle"
                title="申請中"
                aria-hidden="true"
              >
                △
              </span>
            )}
          </button>
        );
      })}
      {preview && preview.total > 10 && (
        <button
          type="button"
          className="shop-card-more"
          disabled={loading}
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={
            expanded
              ? "取扱銘柄を折りたたむ"
              : `ほか${preview.total - 10}銘柄を表示`
          }
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
