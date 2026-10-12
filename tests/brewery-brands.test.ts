import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadBreweryBrands } from "../src/lib/brewery-brands";

function client(fetcher: typeof fetch) {
  return createClient("https://example.supabase.co", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
}

test("brewery brands batch visible breweries and retain brands past the query limit", async () => {
  const requests: URL[] = [];
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: `brand-${index}`,
    name: `銘柄${index}`,
    brewery_id: index % 2 ? "brewery-a" : "brewery-b",
  }));
  const db = client(async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const offset = Number(url.searchParams.get("offset"));
    return Response.json(rows.slice(offset, offset + 1000));
  });
  const result = await loadBreweryBrands(
    db,
    ["brewery-a", "brewery-b", "empty", "brewery-a"],
    new AbortController().signal,
  );
  assert.deepEqual(
    result["brewery-a"],
    rows.filter((row) => row.brewery_id === "brewery-a"),
  );
  assert.deepEqual(
    result["brewery-b"],
    rows.filter((row) => row.brewery_id === "brewery-b"),
  );
  assert.deepEqual(result.empty, []);
  assert.equal(requests.length, 2);
  const params = requests[0].searchParams;
  assert.equal(params.get("select"), "id,name,brewery_id");
  assert.equal(params.get("brewery_id"), "in.(brewery-a,brewery-b,empty)");
  assert.equal(params.get("is_active"), "eq.true");
  assert.equal(params.get("registration_status"), "in.(pending,approved)");
  assert.equal(params.get("order"), "name_kana.asc,id.asc");
  assert.equal(requests[1].searchParams.get("offset"), "1000");
  assert.deepEqual(
    await loadBreweryBrands(db, [], new AbortController().signal),
    {},
  );
  assert.equal(requests.length, 2);
});

test("brewery brand failures and cancellation do not become empty brand lists", async () => {
  await assert.rejects(
    loadBreweryBrands(
      client(async () =>
        Response.json({ message: "unavailable" }, { status: 500 }),
      ),
      ["brewery-a"],
      new AbortController().signal,
    ),
    /酒蔵の銘柄を取得できませんでした/,
  );
  const controller = new AbortController();
  const db = client(async () => {
    controller.abort();
    return Response.json([]);
  });
  await assert.rejects(
    loadBreweryBrands(db, ["brewery-a"], controller.signal),
    {
      name: "AbortError",
    },
  );
});
