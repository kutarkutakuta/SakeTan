import { supabase } from "@/lib/supabase/server";
import { invalidShopIdsResponse, shopIdsFromRequest } from "@/lib/shop-api";

type ShopBrandTotalRow = { shop_id: string; total: number | string };

export async function GET(request: Request) {
  const shopIds = shopIdsFromRequest(request);
  if (!shopIds) return invalidShopIdsResponse();

  const db = await supabase();
  if (!db) return Response.json({});
  const { data, error } = await db.rpc("shop_brand_totals", {
    p_shop_ids: shopIds,
  });
  if (error)
    return Response.json(
      { error: "取扱銘柄数を取得できませんでした" },
      { status: 500 },
    );

  return Response.json(
    Object.fromEntries(
      ((data ?? []) as ShopBrandTotalRow[]).map((row) => [
        row.shop_id,
        Number(row.total),
      ]),
    ),
  );
}
