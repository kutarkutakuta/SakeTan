import { supabase } from "@/lib/supabase/browser";
import { z } from "zod";
import { mapShopLimit } from "@/lib/shop-api";
import type { Shop } from "@/lib/types";
const schema = z.object({
  brand_id: z.uuid().optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  north: z.coerce.number().min(-90).max(90).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
});
export async function GET(request: Request) {
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json({ error: "検索条件が不正です" }, { status: 400 });
  const db = await supabase();
  if (!db) return Response.json({ shops: [], total: 0 });
  const params = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => ["p_" + k, v]),
  );
  try {
    const { data, error, count } = await db
      .rpc("search_shops", params, { count: "exact" })
      .select(
        "id,name,name_kana,prefecture,city,latitude,longitude,google_place_id,geocode_source,geocoded_at,is_active",
      )
      .order("name")
      .order("id")
      .limit(mapShopLimit)
      .abortSignal(request.signal);
    if (error) throw error;
    const shops = (data ?? []) as Shop[];
    return Response.json({ shops, total: count ?? shops.length });
  } catch {
    return Response.json(
      { error: "酒屋を検索できませんでした" },
      { status: 500 },
    );
  }
}
