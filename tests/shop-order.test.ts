import assert from "node:assert/strict";
import test from "node:test";
import { mapBoundsCenter, orderMapShops } from "@/lib/shop-order";

const shops = [
  { id: "far", latitude: 35.003, longitude: 139 },
  { id: "near", latitude: 35.0003, longitude: 139 },
  { id: "middle", latitude: 35.001, longitude: 139 },
];

test("map shop list is ordered by distance from the map center", () => {
  assert.deepEqual(
    orderMapShops(shops, [35, 139], null).map((shop) => shop.id),
    ["near", "middle", "far"],
  );
});

test("selected shop stays first and other shops remain distance ordered", () => {
  assert.deepEqual(
    orderMapShops(shops, [35, 139], "far").map((shop) => shop.id),
    ["far", "near", "middle"],
  );
});

test("original order is retained until a map center is available", () => {
  assert.deepEqual(
    orderMapShops(shops, undefined, null).map((shop) => shop.id),
    ["far", "near", "middle"],
  );
});

test("map bounds center supports ordinary and date-line-crossing bounds", () => {
  assert.deepEqual(
    mapBoundsCenter({ south: 34, north: 36, west: 138, east: 140 }),
    [35, 139],
  );
  assert.deepEqual(
    mapBoundsCenter({ south: -1, north: 1, west: 170, east: -170 }),
    [0, -180],
  );
});
