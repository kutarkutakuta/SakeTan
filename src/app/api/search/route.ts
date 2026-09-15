import { supabase } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const db = await supabase();
  if (!db) return Response.json({ brands: [], shops: [] });
  const searchParams = new URL(request.url).searchParams;
  const q = searchParams.get("q")?.trim().slice(0, 150) ?? "";
  const scope = searchParams.get("scope");
  const brandsOnly = scope === "brands";
  const shopsOnly = scope === "shops";
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
    const { data, error } = await db.rpc("search_shops", { p_query: q });
    return error
      ? Response.json(
          { error: "検索できませんでした。しばらくしてからお試しください。" },
          { status: 500 },
        )
      : Response.json({ brands: [], shops: data });
  }
  const [b, s] = await Promise.all([
    db.rpc("search_brands", { p_query: q }),
    db.rpc("search_shops", { p_query: q }),
  ]);
  if (b.error || s.error)
    return Response.json(
      { error: "検索できませんでした。しばらくしてからお試しください。" },
      { status: 500 },
    );
  return Response.json({ brands: b.data, shops: s.data });
}
