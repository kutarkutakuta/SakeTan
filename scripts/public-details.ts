import type { Brand, Brewery, ShopBrand } from "../src/lib/types";
import type {
  PublicDetailSnapshot,
  PublicShopData,
} from "../src/lib/public-detail";

export type PublicShop = PublicShopData["shop"];
export type PublicRelation = Omit<ShopBrand, "brands">;

export function buildPublicDetails(
  shops: PublicShop[],
  brands: Brand[],
  breweries: Brewery[],
  relations: PublicRelation[],
  comments: { shop_id: string }[],
): PublicDetailSnapshot {
  const snapshot: PublicDetailSnapshot = {
    shops: {},
    brands: {},
    breweries: {},
  };
  const breweryById = new Map(
    breweries.map((brewery) => [brewery.id, brewery]),
  );
  for (const shop of shops)
    snapshot.shops[shop.id] = { shop, relations: [], commentCount: 0 };
  for (const brewery of breweries)
    snapshot.breweries[brewery.id] = {
      initial: { ...brewery },
      brewery: null,
      brands: [],
      shops: [],
    };
  for (const brand of brands) {
    const brewery = breweryById.get(brand.brewery_id ?? "") ?? null;
    snapshot.brands[brand.id] = {
      initial: { ...brand },
      brewery,
      brands: [],
      shops: [],
    };
    if (brand.brewery_id && snapshot.breweries[brand.brewery_id])
      snapshot.breweries[brand.brewery_id].brands.push(brand);
  }
  for (const relation of relations) {
    const shopData = snapshot.shops[relation.shop_id];
    const brandData = snapshot.brands[relation.brand_id];
    if (!shopData || !brandData || !relation.is_active) continue;
    if (relation.status !== "available" && relation.status !== "unavailable")
      continue;
    const brand = brandData.initial as Brand;
    if (brandData.brewery)
      shopData.relations.push({
        ...relation,
        brands: { ...brand, breweries: brandData.brewery },
      });
    if (relation.status === "available") {
      const { id, name, prefecture, city } = shopData.shop;
      brandData.shops.push({ id, name, prefecture, city });
    }
  }
  for (const comment of comments) {
    const shop = snapshot.shops[comment.shop_id];
    if (shop) shop.commentCount += 1;
  }
  return snapshot;
}
