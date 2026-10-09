import type { SupabaseClient } from "@supabase/supabase-js";
import type { Shop } from "./types";
import { prefectures } from "./brand-index";
import { collectPaged } from "./paged-query";

export type BrandShop = Pick<Shop, "id" | "name" | "prefecture" | "city">;
export async function loadBrandShops(
  db: SupabaseClient,
  brandId: string,
  signal: AbortSignal,
) {
  return collectPaged<BrandShop>(async (from, to) => {
    if (signal.aborted)
      throw new DOMException("取扱店舗の取得を中止しました", "AbortError");
    const { data, error } = await db
      .from("shops")
      .select("id,name,prefecture,city,shop_brands!inner(brand_id)")
      .eq("is_active", true)
      .eq("shop_brands.brand_id", brandId)
      .eq("shop_brands.is_active", true)
      .eq("shop_brands.status", "available")
      .order("id")
      .range(from, to)
      .abortSignal(signal);
    if (signal.aborted)
      throw new DOMException("取扱店舗の取得を中止しました", "AbortError");
    if (error)
      throw new Error("取扱店舗を取得できませんでした", { cause: error });
    return (data ?? []) as BrandShop[];
  });
}

export function groupBrandShops(shops: BrandShop[]) {
  const groups = new Map<string, BrandShop[]>();
  for (const shop of shops) {
    const prefecture = shop.prefecture?.trim() || "所在地未登録";
    const group = groups.get(prefecture) ?? [];
    group.push(shop);
    groups.set(prefecture, group);
  }
  const collator = new Intl.Collator("ja", { numeric: true });
  const prefectureOrder = new Map<string, number>(
    prefectures.map((prefecture, index) => [prefecture, index]),
  );
  return [...groups]
    .map(([prefecture, entries]) => ({
      prefecture,
      label: prefecture.replace(/[都府県]$/u, ""),
      shops: [...entries].sort(
        (a, b) =>
          collator.compare(a.city ?? "", b.city ?? "") ||
          collator.compare(a.name, b.name) ||
          a.id.localeCompare(b.id),
      ),
    }))
    .sort(
      (a, b) =>
        (prefectureOrder.get(a.prefecture) ?? 99) -
          (prefectureOrder.get(b.prefecture) ?? 99) ||
        collator.compare(a.prefecture, b.prefecture),
    );
}
