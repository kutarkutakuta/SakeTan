import { z } from "zod";
import { supabase } from "@/lib/supabase/server";

const schema = z.object({
  brand_id: z.uuid().optional(),
  shop_id: z.uuid().optional(),
});

export async function GET(request: Request) {
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json({ error: "表示条件が不正です" }, { status: 400 });
  const db = await supabase();
  if (!db) return Response.json({ brand: null, shop: null });

  const [brandResult, shopResult] = await Promise.all([
    parsed.data.brand_id
      ? db
          .from("brands")
          .select(
            "id,name,name_kana,brewery_id,external_url,brewery_name,prefecture,sakenowa_rank,sakenowa_score,sakenowa_rank_year_month,is_active",
          )
          .eq("id", parsed.data.brand_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    parsed.data.shop_id
      ? db
          .from("shops")
          .select(
            "id,name,name_kana,prefecture,city,latitude,longitude,google_place_id,source,source_id,source_url,geocode_source,geocode_precision,geocoded_at,is_active",
          )
          .eq("id", parsed.data.shop_id)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (brandResult.error || shopResult.error)
    return Response.json(
      { error: "表示条件を読み込めませんでした" },
      { status: 500 },
    );
  return Response.json(
    { brand: brandResult.data, shop: shopResult.data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
