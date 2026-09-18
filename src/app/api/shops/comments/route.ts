import { supabase } from "@/lib/supabase/server";
import { invalidShopIdsResponse, shopIdsFromRequest } from "@/lib/shop-api";
import type { LatestShopComment, ShopCommentSummary } from "@/lib/types";

type LatestShopCommentRow = LatestShopComment & {
  comment_count: number | string;
};

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

  const result = Object.fromEntries(
    shopIds.map((id) => [id, { latest: null, total: 0 }]),
  ) as Record<string, ShopCommentSummary>;
  for (const row of (data ?? []) as LatestShopCommentRow[]) {
    result[row.shop_id] = {
      latest: {
        id: row.id,
        shop_id: row.shop_id,
        comment: row.comment,
        commented_on: row.commented_on,
        user_name: row.user_name,
      },
      total: Number(row.comment_count),
    };
  }
  return Response.json(result);
}
