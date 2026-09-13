import { supabase } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

export async function GET(request: Request) {
  const db = await supabase();
  if (!db) return Response.json([]);
  const prefecture =
    new URL(request.url).searchParams.get("prefecture")?.trim().slice(0, 50) ??
    "";
  const all = new URL(request.url).searchParams.get("all") === "1";
  if (!prefecture && !all)
    return Response.json(
      { error: "都道府県を指定してください" },
      { status: 400 },
    );

  const brands: Brand[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    let query = db
      .from("brands")
      .select(
        "id,name,name_kana,brewery_id,breweries!inner(id,name,name_kana,prefecture)",
      )
      .eq("is_active", true)
      .eq("breweries.is_active", true)
      .order("id")
      .range(from, from + 999);
    if (prefecture) query = query.eq("breweries.prefecture", prefecture);
    const { data, error } = await query;
    if (error)
      return Response.json(
        { error: "銘柄一覧を取得できませんでした" },
        { status: 500 },
      );
    brands.push(...((data ?? []) as unknown as Brand[]));
    if (!data || data.length < 1000) break;
  }

  return Response.json(brands, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
