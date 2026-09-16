import assert from "node:assert/strict";
import test from "node:test";
import { shopMarkerStatus, shopMarkerTitle } from "@/lib/shop-marker";

test("shop marker status distinguishes loading, registered, and unregistered shops", () => {
  assert.equal(shopMarkerStatus(undefined), "loading");
  assert.equal(shopMarkerStatus(0), "unregistered");
  assert.equal(shopMarkerStatus(3), "registered");
});

test("shop marker title explains its brand registration status", () => {
  assert.equal(
    shopMarkerTitle("確認中酒店", undefined),
    "確認中酒店、取扱銘柄を確認中",
  );
  assert.equal(
    shopMarkerTitle("未登録酒店", 0),
    "未登録酒店、取扱銘柄は未登録",
  );
  assert.equal(shopMarkerTitle("登録酒店", 12), "登録酒店、取扱銘柄12件");
});
