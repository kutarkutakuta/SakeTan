export type Brewery = {
  id: string;
  name: string;
  name_kana: string | null;
  prefecture: string | null;
  website_url?: string | null;
  is_active?: boolean;
};
export type Brand = {
  id: string;
  name: string;
  name_kana: string | null;
  brewery_id: string | null;
  external_url?: string | null;
  brewery_name?: string | null;
  prefecture?: string | null;
  sakenowa_rank?: number | null;
  sakenowa_score?: number | null;
  sakenowa_rank_year_month?: string | null;
  breweries?: Brewery | null;
  is_active?: boolean;
};
export type Shop = {
  id: string;
  name: string;
  name_kana: string;
  prefecture: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  google_place_id?: string | null;
  source?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  geocode_source?: "google" | null;
  geocode_precision?:
    | "ROOFTOP"
    | "RANGE_INTERPOLATED"
    | "GEOMETRIC_CENTER"
    | "APPROXIMATE"
    | "PLACE"
    | "USER_ADJUSTED"
    | null;
  geocoded_at?: string | null;
  is_active: boolean;
};
export type ShopBrand = {
  id: string;
  shop_id: string;
  brand_id: string;
  created_by?: string | null;
  is_active: boolean;
  status: ShopBrandStatus;
  first_seen_at: string | null;
  last_seen_at: string | null;
  brands: Brand;
};
export type ShopBrandStatus = "available" | "unavailable" | "incorrect";

export type BrandRequest = {
  id: string;
  name: string;
  brewery_name: string | null;
  note: string | null;
  shop_id: string | null;
  submitted_by: string;
  status: "pending" | "resolved" | "dismissed";
  created_at: string;
  shops?: { name: string } | null;
};
export type Sighting = {
  id: string;
  shop_brand_id: string;
  user_id: string;
  comment: string | null;
  observed_at: string;
  is_deleted: boolean;
  users: { name: string } | null;
};
export type ShopComment = {
  id: string;
  shop_id: string;
  user_id: string;
  comment: string;
  commented_on: string;
  is_deleted: boolean;
  users: { name: string } | null;
};
export type Bounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};
export type EntityType = "shop" | "brand" | "brewery";
export type History = {
  id: string;
  entity_type: EntityType | "shop_brand";
  entity_id: string;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  reason: string | null;
  users: { name: string } | null;
};
