import assert from "node:assert/strict";
import test from "node:test";
import { shopPageTitle } from "@/lib/shop-page-title";

test("shop page titles use the store name without its kana", () => {
  assert.equal(shopPageTitle("地酒庵 さとう"), "地酒庵 さとう - さけのありか");
  assert.equal(
    shopPageTitle(" 地酒庵 さとう "),
    "地酒庵 さとう - さけのありか",
  );
});

test("empty shop names keep a useful generic title", () => {
  assert.equal(shopPageTitle("  "), "酒屋情報 - さけのありか");
});
