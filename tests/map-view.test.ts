import assert from "node:assert/strict";
import test from "node:test";
import {
  mapAwareShopPath,
  mapReturnPath,
  parseMapView,
  safeMapReturnPath,
} from "@/lib/map-view";

test("map view round-trips through a shop page return URL", () => {
  const returnPath = mapReturnPath({
    brandId: "brand-1",
    shopId: "shop-1",
    view: { center: [35.681236, 139.767125], zoom: 16.25 },
  });
  const shopPath = mapAwareShopPath("shop-1", returnPath);
  const encodedReturnPath = new URL(
    shopPath,
    "https://saketan.local",
  ).searchParams.get("return_to");

  assert.equal(
    encodedReturnPath,
    "/?shop_id=shop-1&brand_id=brand-1&map_lat=35.681236&map_lng=139.767125&map_zoom=16.25",
  );
  assert.deepEqual(
    parseMapView(
      Object.fromEntries(
        new URL(encodedReturnPath!, "https://saketan.local").searchParams,
      ),
    ),
    { center: [35.681236, 139.767125], zoom: 16.25 },
  );
});

test("invalid map coordinates are ignored", () => {
  assert.equal(
    parseMapView({ map_lat: "91", map_lng: "139", map_zoom: "14" }),
    undefined,
  );
  assert.equal(
    parseMapView({ map_lat: "35", map_lng: "139", map_zoom: "zoom" }),
    undefined,
  );
});

test("shop return URLs cannot leave the map route", () => {
  assert.equal(
    safeMapReturnPath("https://example.com/", "shop-1"),
    "/?shop_id=shop-1",
  );
  assert.equal(safeMapReturnPath("/account", "shop-1"), "/?shop_id=shop-1");
  assert.equal(
    safeMapReturnPath("/?shop_id=shop-1&map_zoom=15", "shop-1"),
    "/?shop_id=shop-1&map_zoom=15",
  );
});
