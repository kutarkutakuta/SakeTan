import { supabase } from "@/lib/supabase/server";
import { z } from "zod";
const schema = z.object({
  brand_id: z.uuid().optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  north: z.coerce.number().min(-90).max(90).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
});
export async function GET(request: Request) {
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json({ error: "検索条件が不正です" }, { status: 400 });
  const db = await supabase();
  if (!db) return Response.json([]);
  const params = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => ["p_" + k, v]),
  );
  const { data, error } = await db.rpc("search_shops", params);
  if (error)
    return Response.json(
      { error: "酒屋を検索できませんでした" },
      { status: 500 },
    );
  return Response.json(data);
}
