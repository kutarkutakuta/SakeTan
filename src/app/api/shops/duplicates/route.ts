import { supabase } from "@/lib/supabase/server";
import { nearbyShops } from "@/lib/shop-duplicates";
import { z } from "zod";

const RADIUS_METERS = 200;
const schema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  google_place_id: z.string().trim().max(150).optional(),
});

type Candidate = {
  id: string;
  name: string;
  prefecture: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  is_active: boolean;
};

export async function GET(request: Request) {
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json({ error: "検索条件が不正です" }, { status: 400 });

  const db = await supabase();
  if (!db) return Response.json({ exact: null, nearby: [] });

  const { latitude, longitude, google_place_id: googlePlaceId } = parsed.data;
  const latitudeDelta = RADIUS_METERS / 111_320;
  const longitudeDelta =
    RADIUS_METERS /
    (111_320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  const fields =
    "id,name,prefecture,city,latitude,longitude,google_place_id,is_active";

  const [exactResult, nearbyResult] = await Promise.all([
    googlePlaceId
      ? db
          .from("shops")
          .select(fields)
          .eq("google_place_id", googlePlaceId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("shops")
      .select(fields)
      .gte("latitude", latitude - latitudeDelta)
      .lte("latitude", latitude + latitudeDelta)
      .gte("longitude", longitude - longitudeDelta)
      .lte("longitude", longitude + longitudeDelta)
      .limit(50),
  ]);

  if (exactResult.error || nearbyResult.error)
    return Response.json(
      { error: "登録済みの酒屋を確認できませんでした" },
      { status: 500 },
    );

  const exact = exactResult.data as Candidate | null;
  const nearby = nearbyShops(
    (nearbyResult.data ?? []) as Candidate[],
    {
      latitude,
      longitude,
    },
    {
      excludeId: exact?.id,
      radiusMeters: RADIUS_METERS,
      limit: 3,
    },
  );

  return Response.json({ exact, nearby });
}
