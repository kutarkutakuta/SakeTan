import { supabase } from "@/lib/supabase/server";
import {
  orderedShopBrands,
  type ShopBrandSummary,
} from "@/lib/shop-brand-order";
import { collectPaged } from "@/lib/paged-query";
import { invalidShopIdsResponse, shopIdsFromRequest } from "@/lib/shop-api";
import type { Brand } from "@/lib/types";

type ShopBrandRow = ShopBrandSummary & {
  id: string;
  shop_id: string;
  brand_id: string;
};
type ShopBrandPreview = { brands: Brand[]; total: number };

export async function GET(request: Request) {
  const shopIds = shopIdsFromRequest(request);
  if (!shopIds) return invalidShopIdsResponse();

  const db = await supabase();
  if (!db) return Response.json({});
  let rows: ShopBrandRow[];
  try {
    rows = await collectPaged(async (from, to) => {
      const { data, error } = await db
        .from("shop_brands")
        .select(
          "id,shop_id,brand_id,last_seen_at,brands!inner(id,name,name_kana,brewery_id,sakenowa_rank,sakenowa_score,sakenowa_rank_year_month)",
        )
        .in("shop_id", shopIds)
        .eq("is_active", true)
        .eq("brands.is_active", true)
        .order("shop_id")
        .order("brand_id")
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as ShopBrandRow[];
    });
  } catch {
    return Response.json(
      { error: "取扱銘柄を取得できませんでした" },
      { status: 500 },
    );
  }

  const grouped = new Map<string, ShopBrandRow[]>();
  for (const row of rows) {
    const rows = grouped.get(row.shop_id) ?? [];
    rows.push(row);
    grouped.set(row.shop_id, rows);
  }
  const result: Record<string, ShopBrandPreview> = {};
  for (const id of shopIds) {
    const brands = orderedShopBrands(grouped.get(id) ?? []);
    result[id] = { brands: brands.slice(0, 10), total: brands.length };
  }
  return Response.json(result);
}
