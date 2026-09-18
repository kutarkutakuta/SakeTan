import { supabase } from "@/lib/supabase/server";
import { invalidShopIdsResponse, shopIdsFromRequest } from "@/lib/shop-api";
import type { LatestShopComment } from "@/lib/types";

export async function GET(request: Request) {
  const shopIds = shopIdsFromRequest(request);
  if (!shopIds) return invalidShopIdsResponse();

  const db = await supabase();
  if (!db) return Response.json({});
  const { data, error } = await db.rpc("latest_shop_comments", {
    p_shop_ids: shopIds,
  });
  if (error)
    return Response.json(
      { error: "最新コメントを取得できませんでした" },
      { status: 500 },
    );

  return Response.json(
    Object.fromEntries(
      ((data ?? []) as LatestShopComment[]).map((item) => [item.shop_id, item]),
    ),
  );
}
