const siteName = "さけのありか";

export function shopPageTitle(shopName: string) {
  const name = shopName.trim();
  return name ? `${name} - ${siteName}` : `酒屋情報 - ${siteName}`;
}
