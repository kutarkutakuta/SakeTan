import { adminClient } from "./supabase-admin";
const seedUser = "de000000-0000-4000-8000-000000000001";
const shops = [
  {
    id: "de000000-0000-4000-8000-000000000101",
    name: "【デモ】まちかど酒店",
    name_kana: "まちかどさけてん",
    prefecture: "東京都",
    city: "千代田区",
    latitude: 35.686,
    longitude: 139.77,
  },
  {
    id: "de000000-0000-4000-8000-000000000102",
    name: "【デモ】川沿いの酒屋",
    name_kana: "かわぞいのさかや",
    prefecture: "東京都",
    city: "中央区",
    latitude: 35.678,
    longitude: 139.785,
  },
  {
    id: "de000000-0000-4000-8000-000000000103",
    name: "【デモ】小路の日本酒店",
    name_kana: "こうじのにほんしゅてん",
    prefecture: "東京都",
    city: "台東区",
    latitude: 35.708,
    longitude: 139.777,
  },
  {
    id: "de000000-0000-4000-8000-000000000104",
    name: "【デモ】みどり酒店",
    name_kana: "みどりさけてん",
    prefecture: "東京都",
    city: "文京区",
    latitude: 35.712,
    longitude: 139.759,
  },
];
async function main() {
  if (process.env.ALLOW_DEV_SEED !== "true")
    throw new Error("開発用DBでのみ ALLOW_DEV_SEED=true を設定してください。");
  const db = adminClient();
  const { data: brands, error: brandError } = await db
    .from("brands")
    .select("id")
    .eq("source", "sakenowa")
    .eq("is_active", true)
    .order("source_id")
    .limit(8);
  if (brandError) throw new Error(brandError.message);
  if (!brands || brands.length < 4)
    throw new Error("先に npm run import:sakenowa を実行してください。");
  const existing = await db.auth.admin.getUserById(seedUser);
  if (!existing.data.user) {
    const { error } = await db.auth.admin.createUser({
      id: seedUser,
      email: "saketan-demo@example.invalid",
      email_confirm: true,
      user_metadata: { full_name: "開発用デモユーザー" },
      ban_duration: "876000h",
    });
    if (error) throw new Error(error.message);
  }
  const { error: shopError } = await db.from("shops").upsert(
    shops.map((s) => ({ ...s, created_by: seedUser })),
    { ignoreDuplicates: true },
  );
  if (shopError) throw new Error(shopError.message);
  for (let i = 0; i < shops.length; i++) {
    for (let j = 0; j < 3; j++) {
      const day = `2026-09-${String(1 + i + j).padStart(2, "0")}`;
      const relationId = `de000000-0000-4000-8000-${String(201 + i * 10 + j).padStart(12, "0")}`;
      const sightingId = `de000000-0000-4000-8000-${String(301 + i * 10 + j).padStart(12, "0")}`;
      // Preserve previous sample choices and any later edits on repeated runs.
      const { data: existingSighting, error: existingError } = await db
        .from("sightings")
        .select("id")
        .eq("id", sightingId)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (existingSighting) continue;
      const { error: r } = await db.from("shop_brands").upsert(
        {
          id: relationId,
          shop_id: shops[i].id,
          brand_id: brands[(i + j) % brands.length].id,
          created_by: seedUser,
          first_seen_at: day,
          last_seen_at: day,
        },
        { onConflict: "shop_id,brand_id", ignoreDuplicates: true },
      );
      if (r) throw new Error(r.message);
      const { data: relation, error: relationError } = await db
        .from("shop_brands")
        .select("id,first_seen_at,last_seen_at")
        .eq("shop_id", shops[i].id)
        .eq("brand_id", brands[(i + j) % brands.length].id)
        .single();
      if (relationError) throw new Error(relationError.message);
      const { error: s } = await db.from("sightings").upsert({
        id: sightingId,
        shop_brand_id: relation.id,
        user_id: seedUser,
        observed_at: day,
        comment: "開発用サンプル投稿です。実際の取扱情報ではありません。",
      });
      if (s) throw new Error(s.message);
      const { error: datesError } = await db
        .from("shop_brands")
        .update({
          first_seen_at:
            relation.first_seen_at && relation.first_seen_at < day
              ? relation.first_seen_at
              : day,
          last_seen_at:
            relation.last_seen_at && relation.last_seen_at > day
              ? relation.last_seen_at
              : day,
        })
        .eq("id", relation.id);
      if (datesError) throw new Error(datesError.message);
    }
  }
  console.log("開発用seed完了: 架空酒屋4件・取扱関係12件・投稿12件。");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "seedに失敗しました");
  process.exitCode = 1;
});
