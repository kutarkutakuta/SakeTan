import assert from "node:assert/strict";
import test from "node:test";
import {
  invalidShopIdsResponse,
  mapShopCountLabel,
  shopIdsFromRequest,
} from "@/lib/shop-api";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";

test("map count shows the total only when the 200-shop limit is exceeded", () => {
  assert.equal(mapShopCountLabel(0), "0件");
  assert.equal(mapShopCountLabel(199), "199件");
  assert.equal(mapShopCountLabel(200), "200件");
  assert.equal(mapShopCountLabel(201), "201件中200件まで表示");
  assert.equal(mapShopCountLabel(1201), "1201件中200件まで表示");
});

test("shopIdsFromRequest validates and deduplicates shop IDs", () => {
  const request = new Request(
    `https://example.test/api?ids=${firstId},${secondId},${firstId}`,
  );

  assert.deepEqual(shopIdsFromRequest(request), [firstId, secondId]);
  assert.equal(
    shopIdsFromRequest(new Request("https://example.test/api?ids=invalid")),
    null,
  );
});

test("invalidShopIdsResponse returns the shared validation error", async () => {
  const response = invalidShopIdsResponse();

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "酒屋IDを確認してください",
  });
});

test("brand totals can use 500-shop batches while other metadata stays at 50", () => {
  const ids = Array.from(
    { length: 501 },
    (_, index) =>
      `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  const request = (count: number) =>
    new Request(
      `https://example.test/api?ids=${ids.slice(0, count).join(",")}`,
    );

  assert.equal(shopIdsFromRequest(request(50))?.length, 50);
  assert.equal(shopIdsFromRequest(request(51)), null);
  assert.equal(shopIdsFromRequest(request(500), 500)?.length, 500);
  assert.equal(shopIdsFromRequest(request(501), 500), null);
});
