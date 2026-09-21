import { z } from "zod";
import { currentUser, supabase } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success)
    return Response.json({ error: "酒屋IDが不正です" }, { status: 400 });

  const db = await supabase();
  if (!db)
    return Response.json(
      { error: "取扱情報の変更にはSupabaseの接続設定が必要です。" },
      { status: 503 },
    );

  const [shopResult, relationsResult, user] = await Promise.all([
    db
      .from("shops")
      .select("id,name,is_active")
      .eq("id", id.data)
      .maybeSingle(),
    db
      .from("shop_brands")
      .select(
        "id,shop_id,brand_id,is_active,status,first_seen_at,last_seen_at,brands!inner(is_active)",
      )
      .eq("shop_id", id.data)
      .eq("brands.is_active", true),
    currentUser(),
  ]);
  if (shopResult.error || relationsResult.error)
    return Response.json(
      { error: "取扱情報を取得できませんでした" },
      { status: 500 },
    );
  if (!shopResult.data)
    return Response.json({ error: "酒屋が見つかりません" }, { status: 404 });

  return Response.json(
    {
      shop: shopResult.data,
      shopRelations: relationsResult.data ?? [],
      copyAllowed: Boolean(user && !user.is_anonymous),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
