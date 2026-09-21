import assert from "node:assert/strict";
import test from "node:test";
import {
  shopMarkerLevel,
  shopMarkerStatus,
  shopMarkerTitle,
} from "@/lib/shop-marker";

test("shop marker status distinguishes loading, registered, and unregistered shops", () => {
  assert.equal(shopMarkerStatus(undefined), "loading");
  assert.equal(shopMarkerStatus(0), "unregistered");
  assert.equal(shopMarkerStatus(3), "registered");
});

test("shop marker level divides registered brand totals into five ranges", () => {
  assert.equal(shopMarkerLevel(undefined), undefined);
  assert.equal(shopMarkerLevel(0), undefined);
  assert.equal(shopMarkerLevel(1), 1);
  assert.equal(shopMarkerLevel(19), 1);
  assert.equal(shopMarkerLevel(20), 2);
  assert.equal(shopMarkerLevel(49), 2);
  assert.equal(shopMarkerLevel(50), 3);
  assert.equal(shopMarkerLevel(99), 3);
  assert.equal(shopMarkerLevel(100), 4);
  assert.equal(shopMarkerLevel(199), 4);
  assert.equal(shopMarkerLevel(200), 5);
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
