import assert from "node:assert/strict";
import test from "node:test";
import { invalidShopIdsResponse, shopIdsFromRequest } from "@/lib/shop-api";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";

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
