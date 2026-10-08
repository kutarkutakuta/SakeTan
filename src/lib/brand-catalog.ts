import { supabase } from "@/lib/supabase/browser";
import type { Brand } from "@/lib/types";

const pageSize = 1000;

export async function loadBrandCatalog(signal: AbortSignal): Promise<Brand[]> {
  const db = await supabase();
  if (!db) throw new Error("銘柄一覧の接続先が設定されていません");
  const brands: Brand[] = [];
  let lastId: string | undefined;

  while (!signal.aborted) {
    let query = db
      .from("brands")
      .select(
        "id,name,name_kana,brewery_id,registration_status,requested_brewery_name,breweries(id,name,name_kana,prefecture)",
      )
      .eq("is_active", true)
      .in("registration_status", ["pending", "approved"])
      .order("id")
      .limit(pageSize)
      .abortSignal(signal);
    if (lastId) query = query.gt("id", lastId);

    const { data, error } = await query;
    if (error)
      throw new Error("銘柄一覧を取得できませんでした", { cause: error });
    const page = (data ?? []) as unknown as Brand[];
    brands.push(
      ...page.filter(
        (brand) =>
          brand.registration_status === "pending" ||
          Boolean(brand.breweries?.id),
      ),
    );
    if (page.length < pageSize) return brands;
    lastId = page[page.length - 1].id;
  }

  throw new DOMException("銘柄一覧の取得を中止しました", "AbortError");
}
