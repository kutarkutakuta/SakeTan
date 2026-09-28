import { z } from "zod";
import { authorization, supabase } from "@/lib/supabase/server";
import type { Brand, BrandStatusItem, BrandStatusShop } from "@/lib/types";

const querySchema = z.object({
  q: z.string().trim().max(150).default(""),
  status: z.enum(["all", "pending", "approved"]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

type RelationRow = {
  brand_id: string;
  status: "available" | "unavailable" | "incorrect";
  shops: { id: string; name: string; is_active: boolean } | null;
};

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json({ error: "検索条件が不正です" }, { status: 400 });

  const db = await supabase();
  if (!db) return Response.json({ items: [], count: 0, page: 1, admin: false });

  const { q, status, page } = parsed.data;
  const pageSize = 30;
  let matchingIds: string[] | null = null;
  if (q) {
    const result = await db.rpc("search_brands", { p_query: q });
    if (result.error)
      return Response.json(
        { error: "銘柄を検索できませんでした" },
        { status: 500 },
      );
    const searchItems = (result.data ?? []) as Brand[];
    const ids = searchItems
      .filter((item) => status === "all" || item.registration_status === status)
      .map((item) => item.id);
    if (!ids.length)
      return Response.json({ items: [], count: 0, page, admin: false });
    matchingIds = ids;
  }

  let brandQuery = db
    .from("brands")
    .select(
      "id,name,name_kana,brewery_id,is_active,registration_status,requested_brewery_name,registered_at,created_at,breweries(id,name,name_kana,prefecture)",
      { count: "exact" },
    )
    .eq("is_active", true)
    .in("registration_status", ["pending", "approved"])
    .order("registration_status", { ascending: false })
    .order("created_at", { ascending: false });
  if (status !== "all")
    brandQuery = brandQuery.eq("registration_status", status);
  if (matchingIds) brandQuery = brandQuery.in("id", matchingIds);
  brandQuery = brandQuery.range((page - 1) * pageSize, page * pageSize - 1);

  const [brandResult, account] = await Promise.all([
    brandQuery,
    authorization(),
  ]);
  if (brandResult.error)
    return Response.json(
      { error: "銘柄の登録状態を取得できませんでした" },
      { status: 500 },
    );

  const brands = (brandResult.data ?? []) as unknown as BrandStatusItem[];
  const ids = brands.map((brand) => brand.id);
  const [relationResult, applicationResult] = await Promise.all([
    ids.length
      ? db
          .from("shop_brands")
          .select("brand_id,status,shops!inner(id,name,is_active)")
          .in("brand_id", ids)
          .eq("status", "available")
          .eq("shops.is_active", true)
      : Promise.resolve({ data: [], error: null }),
    account.admin && ids.length
      ? db
          .from("brand_applications")
          .select("brand_id,reason")
          .in("brand_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (relationResult.error || applicationResult.error)
    return Response.json(
      { error: "銘柄の関連情報を取得できませんでした" },
      { status: 500 },
    );

  const shopsByBrand = new Map<string, BrandStatusShop[]>();
  for (const row of (relationResult.data ?? []) as unknown as RelationRow[]) {
    if (!row.shops || row.status === "incorrect") continue;
    const shops = shopsByBrand.get(row.brand_id) ?? [];
    shops.push({ id: row.shops.id, name: row.shops.name, status: row.status });
    shopsByBrand.set(row.brand_id, shops);
  }
  const reasons = new Map(
    (applicationResult.data ?? []).map((item) => [item.brand_id, item.reason]),
  );
  const items: BrandStatusItem[] = brands.map((brand) => ({
    ...(brand as Brand),
    registration_status: brand.registration_status,
    created_at: brand.created_at,
    shops: (shopsByBrand.get(brand.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, "ja"),
    ),
    ...(account.admin
      ? { application_reason: reasons.get(brand.id) ?? null }
      : {}),
  }));

  return Response.json(
    {
      items,
      count: brandResult.count ?? 0,
      page,
      pageSize,
      admin: account.admin,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
