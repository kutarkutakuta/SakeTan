const siteName = "さけのありか";

export function shopPageTitle(
  shopName: string,
  prefecture?: string | null,
  city?: string | null,
) {
  const name = shopName.trim();
  const location = [prefecture?.trim(), city?.trim()].filter(Boolean).join(" ");
  const title = name ? (location ? `${name}｜${location}` : name) : "酒屋情報";
  return `${title} - ${siteName}`;
}
