import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { groupBrandShops, loadBrandShops } from "../src/lib/brand-shops";

const brandId = "12958fa6-062a-4b2e-9962-49e859a69b7c";
const shops = Array.from({ length: 21 }, (_, index) => ({
  id: `shop-${index}`,
  name: `酒屋${index}`,
  prefecture: "長野県",
  city: "松本市",
}));

function client(fetcher: typeof fetch) {
  return createClient("https://example.supabase.co", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
}

test("brand shop query only includes active available shops for this brand", async () => {
  let requested: URL | undefined;
  const db = client(async (input) => {
    requested = new URL(String(input));
    return Response.json(shops);
  });
  const entries = await loadBrandShops(
    db,
    brandId,
    new AbortController().signal,
  );
  assert.equal(requested?.pathname, "/rest/v1/shops");
  assert.equal(requested?.searchParams.get("is_active"), "eq.true");
  assert.equal(
    requested?.searchParams.get("shop_brands.brand_id"),
    `eq.${brandId}`,
  );
  assert.equal(requested?.searchParams.get("shop_brands.is_active"), "eq.true");
  assert.equal(
    requested?.searchParams.get("shop_brands.status"),
    "eq.available",
  );
  assert.match(
    requested?.searchParams.get("select") ?? "",
    /shop_brands!inner/,
  );
  assert.equal(requested?.searchParams.get("limit"), "1000");
  assert.equal(requested?.searchParams.get("order"), "id.asc");
  assert.deepEqual(entries, shops);
});

test("brand shops load all pages without a user action or an extra count query", async () => {
  const source = Array.from({ length: 1005 }, (_, index) => ({
    ...shops[0],
    id: `shop-${index}`,
  }));
  const offsets: number[] = [];
  const db = client(async (input) => {
    const params = new URL(String(input)).searchParams;
    const offset = Number(params.get("offset"));
    const limit = Number(params.get("limit"));
    assert.equal(limit, 1000);
    assert.equal(params.has("count"), false);
    offsets.push(offset);
    return Response.json(source.slice(offset, offset + limit));
  });
  const entries = await loadBrandShops(
    db,
    brandId,
    new AbortController().signal,
  );
  assert.deepEqual(entries, source);
  assert.deepEqual(offsets, [0, 1000]);
  const empty = await loadBrandShops(
    client(async () => Response.json([])),
    brandId,
    new AbortController().signal,
  );
  assert.deepEqual(empty, []);
});

test("brand shop failures are not reported as an empty list", async () => {
  const db = client(async () =>
    Response.json({ message: "unavailable" }, { status: 500 }),
  );
  await assert.rejects(
    loadBrandShops(db, brandId, new AbortController().signal),
    /取扱店舗を取得できませんでした/,
  );
});

test("brand shop results are ignored if their page is aborted", async () => {
  const controller = new AbortController();
  const db = client(async () => {
    controller.abort();
    return Response.json(shops);
  });
  await assert.rejects(loadBrandShops(db, brandId, controller.signal), {
    name: "AbortError",
  });
});

test("prefecture groups retain every shop, count them and use geographic order", () => {
  const source = [
    { ...shops[0], id: "kanagawa", prefecture: "神奈川県", city: "横浜市" },
    {
      ...shops[0],
      id: "tokyo-2",
      name: "酒屋2",
      prefecture: "東京都",
      city: "中野区",
    },
    { ...shops[0], id: "unknown", prefecture: null },
    { ...shops[0], id: "hokkaido", prefecture: "北海道" },
    {
      ...shops[0],
      id: "tokyo-1",
      name: "酒屋1",
      prefecture: "東京都",
      city: "中野区",
    },
    { ...shops[0], id: "blank", prefecture: "  " },
  ];
  const groups = groupBrandShops(source);
  assert.deepEqual(
    groups.map((group) => [group.label, group.shops.length]),
    [
      ["北海道", 1],
      ["東京", 2],
      ["神奈川", 1],
      ["所在地未登録", 2],
    ],
  );
  assert.equal(
    groups.reduce((total, group) => total + group.shops.length, 0),
    source.length,
  );
  assert.deepEqual(
    groups[1].shops.map((shop) => shop.id),
    ["tokyo-1", "tokyo-2"],
  );
  assert.equal(source[0].id, "kanagawa");
  assert.deepEqual(groupBrandShops([]), []);
});

test("a later page failure does not silently return incomplete prefecture groups", async () => {
  const db = client(async (input) =>
    Number(new URL(String(input)).searchParams.get("offset")) === 0
      ? Response.json(
          Array.from({ length: 1000 }, (_, index) => ({
            ...shops[0],
            id: `shop-${index}`,
          })),
        )
      : Response.json({ message: "unavailable" }, { status: 500 }),
  );
  await assert.rejects(
    loadBrandShops(db, brandId, new AbortController().signal),
    /取扱店舗を取得できませんでした/,
  );
});
