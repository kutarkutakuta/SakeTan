import { z } from "zod";
import { supabase } from "@/lib/supabase/server";
import type { LatestShopComment } from "@/lib/types";

const shopIds = z.array(z.uuid()).min(1).max(50);

export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get("ids") ?? "";
  const parsed = shopIds.safeParse([
    ...new Set(ids.split(",").filter(Boolean)),
  ]);
  if (!parsed.success)
    return Response.json(
      { error: "酒屋IDを確認してください" },
      { status: 400 },
    );

  const db = await supabase();
  if (!db) return Response.json({});
  const { data, error } = await db.rpc("latest_shop_comments", {
    p_shop_ids: parsed.data,
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
