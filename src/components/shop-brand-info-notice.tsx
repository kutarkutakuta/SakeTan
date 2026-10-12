import { Flag } from "lucide-react";

export function ShopBrandInfoNotice({
  compact = false,
}: {
  compact?: boolean;
}) {
  if (compact)
    return (
      <span
        className="shop-brand-info-notice compact"
        role="img"
        aria-label="銘柄情報求む"
        tabIndex={0}
      >
        <Flag size={18} strokeWidth={2} aria-hidden="true" />
        <span className="shop-brand-info-tooltip" aria-hidden="true">
          銘柄情報求む
        </span>
      </span>
    );

  return (
    <span className="shop-brand-info-notice">
      <Flag size={16} strokeWidth={2} aria-hidden="true" />
      銘柄情報求む
    </span>
  );
}
