import { z } from "zod";
import { supabase } from "@/lib/supabase/browser";
import {
  orderedShopBrands,
  type ShopBrandSummary,
} from "@/lib/shop-brand-order";
import type { Brand } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success)
    return Response.json({ error: "酒屋IDが不正です" }, { status: 400 });
  const db = await supabase();
  if (!db) return Response.json([]);

  const { data, error } = await db
    .from("shop_brands")
    .select(
      "last_seen_at,brands!inner(id,name,name_kana,brewery_id,sakenowa_rank,sakenowa_score,sakenowa_rank_year_month,sakenowa_area_rank,sakenowa_area_score,sakenowa_area_id,sakenowa_area_name,registration_status,breweries(id,is_active))",
    )
    .eq("shop_id", id.data)
    .eq("is_active", true)
    .eq("brands.is_active", true);
  if (error)
    return Response.json(
      { error: "取扱銘柄を取得できませんでした" },
      { status: 500 },
    );

  const visibleRows = (data ?? []).filter((row: unknown) => {
    const brand = (row as unknown as ShopBrandSummary).brands as Brand & {
      breweries?: { id: string; is_active: boolean } | null;
    };
    return (
      brand.registration_status === "pending" ||
      Boolean(brand.breweries?.is_active)
    );
  });

  return Response.json(
    orderedShopBrands(visibleRows as unknown as ShopBrandSummary[]),
  );
}
