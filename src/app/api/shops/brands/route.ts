import { supabase } from "@/lib/supabase/server";
import { invalidShopIdsResponse, shopIdsFromRequest } from "@/lib/shop-api";
import type { Brand } from "@/lib/types";

type ShopBrandPreviewRow = {
  shop_id: string;
  total: number | string;
  brand_id: string;
  brand_name: string;
  brand_name_kana: string | null;
  brewery_id: string | null;
  sakenowa_rank: number | null;
  sakenowa_score: number | null;
  sakenowa_rank_year_month: string | null;
};
type ShopBrandPreview = { brands: Brand[]; total: number };

export async function GET(request: Request) {
  const shopIds = shopIdsFromRequest(request);
  if (!shopIds) return invalidShopIdsResponse();

  const db = await supabase();
  if (!db) return Response.json({});
  const { data, error } = await db.rpc("shop_brand_previews", {
    p_shop_ids: shopIds,
    p_limit: 10,
  });
  if (error)
    return Response.json(
      { error: "取扱銘柄を取得できませんでした" },
      { status: 500 },
    );

  const result = Object.fromEntries(
    shopIds.map((id) => [id, { brands: [], total: 0 }]),
  ) as Record<string, ShopBrandPreview>;
  for (const row of (data ?? []) as ShopBrandPreviewRow[]) {
    const preview = result[row.shop_id];
    if (!preview) continue;
    preview.total = Number(row.total);
    preview.brands.push({
      id: row.brand_id,
      name: row.brand_name,
      name_kana: row.brand_name_kana,
      brewery_id: row.brewery_id,
      sakenowa_rank: row.sakenowa_rank,
      sakenowa_score: row.sakenowa_score,
      sakenowa_rank_year_month: row.sakenowa_rank_year_month,
    });
  }
  return Response.json(result);
}
