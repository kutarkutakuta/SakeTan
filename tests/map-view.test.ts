import assert from "node:assert/strict";
import test from "node:test";
import {
  mapAwareShopPath,
  mapReturnPath,
  parseMapView,
  readSessionMapView,
  safeMapReturnPath,
  saveSessionMapView,
} from "@/lib/map-view";

test("shop return URL preserves selection without map coordinates", () => {
  const returnPath = mapReturnPath({
    brandId: "brand-1",
    shopId: "shop-1",
  });
  const shopPath = mapAwareShopPath("shop-1", returnPath);
  const encodedReturnPath = new URL(
    shopPath,
    "https://saketan.local",
  ).searchParams.get("return_to");

  assert.equal(encodedReturnPath, "/?shop_id=shop-1&brand_id=brand-1");
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

test("last map position survives a page remount in the same session", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
      },
    },
  });
  try {
    saveSessionMapView({ center: [35.681236, 139.767125], zoom: 16.25 });
    assert.deepEqual(readSessionMapView(), {
      center: [35.681236, 139.767125],
      zoom: 16.25,
    });
    saved.set("saketan:last-map-view", "map_lat=91&map_lng=139&map_zoom=14");
    assert.equal(readSessionMapView(), undefined);
  } finally {
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
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
