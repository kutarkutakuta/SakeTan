import { supabase } from "@/lib/supabase/server";

function optionalNumber(
  searchParams: URLSearchParams,
  name: string,
  minimum: number,
  maximum: number,
) {
  const value = searchParams.get(name);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : undefined;
}

export async function GET(request: Request) {
  const db = await supabase();
  if (!db) return Response.json({ brands: [], shops: [] });
  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get("q")?.trim().slice(0, 150) ?? "";
  const scope = searchParams.get("scope");
  const brandsOnly = scope === "brands";
  const shopsOnly = scope === "shops";
  const shopLimit = optionalNumber(searchParams, "shop_limit", 1, 50);
  const shopOffset = optionalNumber(searchParams, "shop_offset", 0, 10000);
  const latitude = optionalNumber(searchParams, "latitude", -90, 90);
  const longitude = optionalNumber(searchParams, "longitude", -180, 180);
  if (
    shopLimit === undefined ||
    shopOffset === undefined ||
    latitude === undefined ||
    longitude === undefined
  )
    return Response.json({ error: "検索条件が不正です" }, { status: 400 });
  const incompleteLocation = (latitude === null) !== (longitude === null);
  if (incompleteLocation)
    return Response.json({ error: "検索条件が不正です" }, { status: 400 });
  const client = db;
  const requestedShopLimit = shopLimit === null ? null : Math.trunc(shopLimit);
  const requestedShopOffset = Math.trunc(shopOffset ?? 0);

  async function searchShops() {
    if (requestedShopLimit === null) {
      const result = await client.rpc("search_shops", { p_query: q });
      return { ...result, hasMore: false };
    }
    const result = await client.rpc("search_shop_candidates", {
      p_query: q,
      p_latitude: latitude,
      p_longitude: longitude,
      p_limit: requestedShopLimit + 1,
      p_offset: requestedShopOffset,
    });
    return {
      ...result,
      data: result.data?.slice(0, requestedShopLimit) ?? null,
      hasMore: (result.data?.length ?? 0) > requestedShopLimit,
    };
  }

  if (brandsOnly) {
    const { data, error } = await db.rpc("search_brands", { p_query: q });
    return error
      ? Response.json(
          { error: "検索できませんでした。しばらくしてからお試しください。" },
          { status: 500 },
        )
      : Response.json({ brands: data, shops: [] });
  }
  if (shopsOnly) {
    const { data, error, hasMore } = await searchShops();
    return error
      ? Response.json(
          { error: "検索できませんでした。しばらくしてからお試しください。" },
          { status: 500 },
        )
      : Response.json({ brands: [], shops: data, shopsHasMore: hasMore });
  }
  const [b, s] = await Promise.all([
    db.rpc("search_brands", { p_query: q }),
    searchShops(),
  ]);
  if (b.error || s.error)
    return Response.json(
      { error: "検索できませんでした。しばらくしてからお試しください。" },
      { status: 500 },
    );
  return Response.json({
    brands: b.data,
    shops: s.data,
    shopsHasMore: s.hasMore,
  });
}
