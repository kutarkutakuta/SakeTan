import { z } from "zod";
import { supabase } from "@/lib/supabase/browser";

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
      { error: "酒屋を表示するには接続設定が必要です。" },
      { status: 503 },
    );

  const [shopResult, relationsResult, commentCountResult] = await Promise.all([
    db
      .from("shops")
      .select("id,name,name_kana,prefecture,city,google_place_id,is_active")
      .eq("id", id.data)
      .maybeSingle(),
    db
      .from("shop_brands")
      .select(
        "id,shop_id,brand_id,is_active,status,first_seen_at,last_seen_at,brands(id,name,name_kana,is_active,registration_status,requested_brewery_name,registered_at,breweries(id,name,name_kana,prefecture,is_active))",
      )
      .eq("shop_id", id.data),
    db
      .from("shop_comments")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", id.data)
      .eq("is_deleted", false),
  ]);
  if (shopResult.error || relationsResult.error || commentCountResult.error)
    return Response.json(
      { error: "酒屋情報を読み込めませんでした" },
      { status: 500 },
    );
  if (!shopResult.data)
    return Response.json({ error: "酒屋が見つかりません" }, { status: 404 });

  const relations = (relationsResult.data ?? []).filter((relation: { brands: unknown }) => {
    const brand = relation.brands as {
      registration_status?: string;
      breweries?: { id: string; is_active?: boolean } | null;
    } | null;
    return (
      brand?.registration_status === "pending" ||
      Boolean(brand?.breweries?.is_active)
    );
  });

  return Response.json(
    {
      shop: shopResult.data,
      relations,
      commentCount: commentCountResult.count ?? 0,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
