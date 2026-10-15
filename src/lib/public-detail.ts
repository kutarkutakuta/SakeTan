import type { BrandShop } from "./brand-shops";
import type { Brand, Brewery, Shop, ShopBrand } from "./types";

export type PublicShopData = {
  shop: Pick<
    Shop,
    | "id"
    | "name"
    | "name_kana"
    | "prefecture"
    | "city"
    | "google_place_id"
    | "is_active"
    | "seeking_brand_info"
  >;
  relations: ShopBrand[];
  commentCount: number;
};

export type PublicMasterData = {
  initial: Record<string, unknown>;
  brewery: Brewery | null;
  brands: Brand[];
  shops: BrandShop[];
};

export type PublicDetailSnapshot = {
  shops: Record<string, PublicShopData>;
  brands: Record<string, PublicMasterData>;
  breweries: Record<string, PublicMasterData>;
};
