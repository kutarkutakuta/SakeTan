import { supabase } from "@/lib/supabase/browser";
import { directoryLabels, type DirectoryItemByType } from "./directory-index";
import type { EntityType } from "./types";

const catalogs = {
  brand: {
    table: "brands",
    fields:
      "id,name,name_kana,brewery_id,registration_status,requested_brewery_name,registered_at,created_at,sakenowa_rank,sakenowa_area_rank,sakenowa_area_name,breweries(id,name,name_kana,prefecture)",
  },
  brewery: {
    table: "breweries",
    fields: "id,name,name_kana,prefecture,created_at",
  },
  shop: {
    table: "shops",
    fields: "id,name,name_kana,prefecture,city,is_active,created_at",
  },
} as const;

export async function loadDirectoryCatalog<T extends EntityType>(
  type: T,
  signal: AbortSignal,
): Promise<DirectoryItemByType[T][]> {
  const db = await supabase();
  const label = `${directoryLabels[type]}一覧`;
  if (!db) throw new Error(`${label}の接続先が設定されていません`);
  const catalog = catalogs[type];
  const items: DirectoryItemByType[T][] = [];
  const pageSize = 1000;
  let lastId: string | undefined;
  while (!signal.aborted) {
    let query = db
      .from(catalog.table)
      .select(catalog.fields)
      .eq("is_active", true)
      .order("id")
      .limit(pageSize)
      .abortSignal(signal);
    if (type === "brand")
      query = query.in("registration_status", ["pending", "approved"]);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    signal.throwIfAborted();
    if (error)
      throw new Error(`${label}を取得できませんでした`, { cause: error });
    const page = (data ?? []) as unknown as DirectoryItemByType[T][];
    items.push(...page);
    if (page.length < pageSize) return items;
    lastId = page[page.length - 1].id;
  }
  throw new DOMException(`${label}の取得を中止しました`, "AbortError");
}
