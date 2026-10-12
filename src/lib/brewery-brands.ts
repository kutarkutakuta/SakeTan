import type { SupabaseClient } from "@supabase/supabase-js";
import { collectPaged } from "./paged-query";

export type BreweryBrand = { id: string; name: string; brewery_id: string };

export async function loadBreweryBrands(
  db: SupabaseClient,
  breweryIds: string[],
  signal: AbortSignal,
): Promise<Record<string, BreweryBrand[]>> {
  const ids = [...new Set(breweryIds)];
  const brandsByBrewery = Object.fromEntries(
    ids.map((id) => [id, [] as BreweryBrand[]]),
  );
  if (!ids.length) return brandsByBrewery;
  const rows = await collectPaged<BreweryBrand>(async (from, to) => {
    if (signal.aborted)
      throw new DOMException("酒蔵の銘柄の取得を中止しました", "AbortError");
    const { data, error } = await db
      .from("brands")
      .select("id,name,brewery_id")
      .in("brewery_id", ids)
      .eq("is_active", true)
      .in("registration_status", ["pending", "approved"])
      .order("name_kana")
      .order("id")
      .range(from, to)
      .abortSignal(signal);
    if (signal.aborted)
      throw new DOMException("酒蔵の銘柄の取得を中止しました", "AbortError");
    if (error)
      throw new Error("酒蔵の銘柄を取得できませんでした", { cause: error });
    return (data ?? []) as BreweryBrand[];
  });
  for (const brand of rows) brandsByBrewery[brand.brewery_id]?.push(brand);
  return brandsByBrewery;
}
