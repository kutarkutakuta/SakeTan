import assert from "node:assert/strict";
import test from "node:test";
import { distanceMeters, nearbyShops } from "../src/lib/shop-duplicates";

test("distanceMeters calculates short geographic distances", () => {
  const distance = distanceMeters(35, 139, 35.001, 139);
  assert.ok(distance > 111 && distance < 112);
});

test("nearbyShops excludes the exact match and returns the closest three", () => {
  const shops = [
    { id: "exact", latitude: 35, longitude: 139 },
    { id: "fourth", latitude: 35.0015, longitude: 139 },
    { id: "second", latitude: 35.0006, longitude: 139 },
    { id: "outside", latitude: 35.003, longitude: 139 },
    { id: "first", latitude: 35.0003, longitude: 139 },
    { id: "third", latitude: 35.001, longitude: 139 },
    { id: "missing", latitude: null, longitude: null },
  ];

  const result = nearbyShops(
    shops,
    { latitude: 35, longitude: 139 },
    { excludeId: "exact", radiusMeters: 200, limit: 3 },
  );

  assert.deepEqual(
    result.map((shop) => shop.id),
    ["first", "second", "third"],
  );
  assert.ok(result.every((shop) => shop.distance_m <= 200));
});
