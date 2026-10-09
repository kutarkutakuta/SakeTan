import assert from "node:assert/strict";
import test from "node:test";

const brandId = "12958fa6-062a-4b2e-9962-49e859a69b7c";
const shopId = "dbbac4e7-7f95-46fc-a919-c68ee7f32bde";

test("explore context loads brewery metadata in the brand request", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";

  try {
    const { GET } =
      await import("@/lib/browser-api/routes/explore-context/route");
    const requests: URL[] = [];
    let brand: Record<string, unknown> | null = null;
    let shopFound = true;
    let fail = false;
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      if (fail)
        return Response.json(
          { code: "42703", message: "column does not exist" },
          { status: 400 },
        );
      if (url.pathname.endsWith("/brands")) {
        const select = url.searchParams.get("select")!;
        assert.ok(select.includes("breweries(id,name,name_kana,prefecture)"));
        const brandColumns = select
          .replace(/breweries\([^)]*\),?/, "")
          .split(",");
        assert.ok(!brandColumns.includes("brewery_name"));
        assert.ok(!brandColumns.includes("prefecture"));
        assert.equal(url.searchParams.get("id"), `eq.${brandId}`);
        return Response.json(brand ? [brand] : []);
      }
      assert.equal(url.pathname, "/rest/v1/shops");
      assert.equal(url.searchParams.get("id"), `eq.${shopId}`);
      assert.equal(url.searchParams.get("is_active"), "eq.true");
      return Response.json(shopFound ? [{ id: shopId, name: "酒屋" }] : []);
    };

    const load = (query = `brand_id=${brandId}`) => {
      requests.length = 0;
      return GET(
        new Request(`https://example.test/api/explore-context?${query}`),
      );
    };

    await t.test(
      "approved brand uses a single indexed relation query",
      async () => {
        brand = {
          id: brandId,
          name: "RYUSUISEN",
          registration_status: "approved",
          breweries: {
            id: "b227e9b6-6536-4a88-9a3a-80c186d2b8b4",
            name: "市野屋",
            name_kana: "いちのや",
            prefecture: "長野県",
          },
        };
        const response = await load();
        assert.equal(response.status, 200);
        assert.equal(requests.length, 1);
        assert.deepEqual(await response.json(), {
          brand: { ...brand, brewery_name: "市野屋", prefecture: "長野県" },
          shop: null,
        });
        assert.equal(
          response.headers.get("Cache-Control"),
          "private, no-store",
        );
      },
    );

    await t.test(
      "pending brand without a brewery keeps its requested name",
      async () => {
        brand = {
          id: brandId,
          registration_status: "pending",
          requested_brewery_name: "申請中の酒蔵",
          breweries: null,
        };
        const response = await load();
        assert.deepEqual(await response.json(), {
          brand: { ...brand, brewery_name: "申請中の酒蔵", prefecture: null },
          shop: null,
        });
      },
    );

    await t.test("missing brand identifies a not-found page", async () => {
      brand = null;
      const response = await load();
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: "情報が見つかりません",
      });
    });

    await t.test("shop-only context does not request a brand", async () => {
      const response = await load(`shop_id=${shopId}`);
      assert.equal(requests.length, 1);
      assert.deepEqual(await response.json(), {
        brand: null,
        shop: { id: shopId, name: "酒屋" },
      });
    });

    await t.test("missing shop also identifies a not-found page", async () => {
      shopFound = false;
      const response = await load(`shop_id=${shopId}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: "情報が見つかりません",
      });
      shopFound = true;
    });

    await t.test(
      "a missing brand cannot be hidden by a valid shop",
      async () => {
        const response = await load(`brand_id=${brandId}&shop_id=${shopId}`);
        assert.equal(response.status, 404);
        assert.equal(requests.length, 2);
      },
    );

    await t.test("home without IDs does not query the database", async () => {
      const response = await load("");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { brand: null, shop: null });
      assert.equal(requests.length, 0);
    });

    await t.test("invalid IDs do not cause a database request", async () => {
      const response = await load("brand_id=invalid");
      assert.equal(response.status, 400);
      assert.equal(requests.length, 0);
    });

    await t.test(
      "actual database failures retain the error response",
      async () => {
        fail = true;
        const response = await load();
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), {
          error: "表示条件を読み込めませんでした",
        });
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
