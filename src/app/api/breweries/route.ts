import { supabase } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const db = await supabase();
  if (!db) return Response.json([]);
  const q = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 150);
  const { data, error } = await db.rpc("search_breweries", { p_query: q });
  return error
    ? Response.json({ error: "酒蔵を検索できませんでした" }, { status: 500 })
    : Response.json(data);
}
