import { Home } from "@/components/home";
import { configured, supabase } from "@/lib/supabase/server";
import type { Brand, Shop } from "@/lib/types";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ brand_id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const db = await supabase();
  let shops: Shop[] = [];
  let brand: Brand | null = null;
  let error = params.error;
  if (db) {
    const { data, error: e } = await db.rpc("search_shops", {
      p_brand_id: params.brand_id || null,
    });
    shops = data ?? [];
    if (e)
      error =
        "酒屋情報を取得できませんでした。接続設定とDB migrationをご確認ください。";
    if (params.brand_id) {
      const { data } = await db
        .from("brands")
        .select("*")
        .eq("id", params.brand_id)
        .maybeSingle();
      brand = data;
    }
  }
  return (
    <Home
      initialShops={shops}
      initialBrand={brand}
      ready={configured()}
      initialError={error}
    />
  );
}
