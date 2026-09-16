import { Home } from "@/components/home";
import { configured, supabase } from "@/lib/supabase/server";
import type { Brand, Shop } from "@/lib/types";
import { parseMapView } from "@/lib/map-view";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    brand_id?: string;
    shop_id?: string;
    error?: string;
    map_lat?: string;
    map_lng?: string;
    map_zoom?: string;
  }>;
}) {
  const params = await searchParams;
  let brand: Brand | null = null;
  let shop: Shop | null = null;
  const error = params.error;
  if (params.brand_id || params.shop_id) {
    const db = await supabase();
    if (db) {
      const [brandResult, shopResult] = await Promise.all([
        params.brand_id
          ? db
              .from("brands")
              .select("*")
              .eq("id", params.brand_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        params.shop_id
          ? db
              .from("shops")
              .select("*")
              .eq("id", params.shop_id)
              .eq("is_active", true)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      brand = brandResult.data;
      shop = shopResult.data;
    }
  }
  return (
    <Home
      initialBrand={brand}
      initialShop={shop}
      initialMapView={parseMapView(params)}
      ready={configured()}
      initialError={error}
    />
  );
}
