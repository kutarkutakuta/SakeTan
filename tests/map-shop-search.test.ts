import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "@/lib/browser-api/routes/shops/route";

test("map search retrieves at most 200 shops with the exact filtered total", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  const brandId = "10000000-0000-4000-8000-000000000001";
  let total = 1201;
  let requests = 0;
  let fail = false;
  try {
    globalThis.fetch = async (input, init) => {
      requests += 1;
      const url = new URL(String(input));
      assert.equal(url.pathname, "/rest/v1/rpc/search_shops");
      assert.equal(url.searchParams.get("limit"), "200");
      assert.equal(url.searchParams.get("order"), "name.asc,id.asc");
      assert.match(
        new Headers(init?.headers).get("Prefer") ?? "",
        /count=exact/,
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_brand_id: brandId,
        p_south: 34,
        p_north: 36,
        p_west: 138,
        p_east: 140,
      });
      if (fail)
        return Response.json({ message: "Search failed" }, { status: 400 });
      const shops = Array.from(
        { length: Math.min(total, 200) },
        (_, index) => ({
          id: `shop-${index}`,
          name: `店${index}`,
        }),
      );
      return Response.json(shops, {
        headers: {
          "Content-Range": `${shops.length ? `0-${shops.length - 1}` : "*"}/${total}`,
        },
      });
    };
    const request = () =>
      new Request(
        `https://example.test/api/shops?brand_id=${brandId}&south=34&north=36&west=138&east=140`,
      );
    for (total of [0, 199, 200, 201, 1201]) {
      const response = await GET(request());
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.shops.length, Math.min(total, 200));
      assert.equal(result.total, total);
    }
    assert.equal(requests, 5);
    fail = true;
    const response = await GET(request());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "酒屋を検索できませんでした",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
