import { z } from "zod";
import { supabase } from "@/lib/supabase/server";

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

  const [shopResult, relationsResult] = await Promise.all([
    db
      .from("shops")
      .select("id,name,prefecture,city,google_place_id,is_active")
      .eq("id", id.data)
      .maybeSingle(),
    db
      .from("shop_brands")
      .select(
        "id,shop_id,brand_id,is_active,status,first_seen_at,last_seen_at,brands(id,name,name_kana,is_active,breweries(id,name,name_kana,prefecture))",
      )
      .eq("shop_id", id.data),
  ]);
  if (shopResult.error || relationsResult.error)
    return Response.json(
      { error: "酒屋情報を読み込めませんでした" },
      { status: 500 },
    );
  if (!shopResult.data)
    return Response.json({ error: "酒屋が見つかりません" }, { status: 404 });

  return Response.json(
    { shop: shopResult.data, relations: relationsResult.data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
