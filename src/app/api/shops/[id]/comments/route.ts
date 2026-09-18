import { z } from "zod";
import { supabase } from "@/lib/supabase/server";
import type { LatestShopComment, ShopCommentPage } from "@/lib/types";

type ShopCommentRow = Omit<LatestShopComment, "user_name"> & {
  users: { name: string } | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = z.uuid().safeParse((await params).id);
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000)
    .safeParse(new URL(request.url).searchParams.get("offset") ?? "0");
  if (!id.success || !offset.success)
    return Response.json(
      { error: "コメントの指定が不正です" },
      { status: 400 },
    );

  const db = await supabase();
  if (!db)
    return Response.json({ latest: null, offset: offset.data, total: 0 });

  const { data, error, count } = await db
    .from("shop_comments")
    .select("id,shop_id,comment,commented_on,users(name)", {
      count: "exact",
    })
    .eq("shop_id", id.data)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset.data, offset.data);
  if (error)
    return Response.json(
      { error: "コメントを取得できませんでした" },
      { status: 500 },
    );

  const row = (data?.[0] ?? null) as unknown as ShopCommentRow | null;
  const response: ShopCommentPage = {
    latest: row
      ? {
          id: row.id,
          shop_id: row.shop_id,
          comment: row.comment,
          commented_on: row.commented_on,
          user_name: row.users?.name ?? null,
        }
      : null,
    offset: offset.data,
    total: count ?? 0,
  };
  return Response.json(response);
}
