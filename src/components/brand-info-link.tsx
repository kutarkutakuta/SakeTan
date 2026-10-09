import { masterDetailHref } from "@/lib/master-navigation";

export function BrandInfoLink({
  brandId,
  brandName,
  returnTo,
}: {
  brandId: string;
  brandName: string;
  returnTo: string;
}) {
  const label = `${brandName}の銘柄情報`;
  return (
    <a
      className="brand-name-link"
      href={masterDetailHref("brand", brandId, returnTo)}
      aria-label={label}
      title={label}
    >
      <strong>{brandName}</strong>
    </a>
  );
}
