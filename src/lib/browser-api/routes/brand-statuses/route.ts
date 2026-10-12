import { z } from "zod";
import { authorization, supabase } from "@/lib/supabase/browser";
import type { Brand, BrandReviewItem } from "@/lib/types";

const querySchema = z.object({
  q: z.string().trim().max(150).default(""),
  status: z.enum(["all", "pending", "approved"]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  id: z.uuid().optional(),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json({ error: "検索条件が不正です" }, { status: 400 });

  const db = await supabase();
  if (!db) return Response.json({ items: [], count: 0, page: 1, admin: false });

  const { q, status, page, id } = parsed.data;
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
  if (id) brandQuery = brandQuery.eq("id", id);
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

  const brands = (brandResult.data ?? []) as unknown as BrandReviewItem[];
  const ids = brands.map((brand) => brand.id);
  const applicationResult = await (account.admin && ids.length
    ? db
        .from("brand_applications")
        .select("brand_id,reason")
        .in("brand_id", ids)
    : Promise.resolve({ data: [], error: null }));
  if (applicationResult.error)
    return Response.json(
      { error: "銘柄の関連情報を取得できませんでした" },
      { status: 500 },
    );

  const reasons = new Map<string, string>(
    (applicationResult.data ?? []).map(
      (item: { brand_id: string; reason: string }) =>
        [item.brand_id, item.reason] as const,
    ),
  );
  const items: BrandReviewItem[] = brands.map((brand) => ({
    ...brand,
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
