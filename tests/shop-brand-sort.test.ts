import assert from "node:assert/strict";
import test from "node:test";
import { sortShopBrands } from "../src/lib/brand-index";
import { shopBrandRankingTag } from "../src/lib/shop-brand-order";
import type { Brand, ShopBrand } from "../src/lib/types";

function relation(
  id: string,
  kana: string,
  fields: Partial<Brand> = {},
): ShopBrand {
  return {
    id,
    shop_id: "shop",
    brand_id: id,
    is_active: true,
    status: "available",
    first_seen_at: null,
    last_seen_at: null,
    brands: { id, name: id, name_kana: kana, brewery_id: null, ...fields },
  };
}

test("shop page ranking order matches national, regional top five, then readings", () => {
  const items = [
    relation("other-z", "わ"),
    relation("regional-5", "う", { sakenowa_area_rank: 5 }),
    relation("national-20", "あ", { sakenowa_rank: 20, sakenowa_area_rank: 1 }),
    relation("regional-2-z", "わ", { sakenowa_area_rank: 2 }),
    relation("other-a", "ア"),
    relation("national-3", "わ", { sakenowa_rank: 3 }),
    relation("regional-2-a", "あ", { sakenowa_area_rank: 2 }),
    relation("regional-6", "か", { sakenowa_area_rank: 6 }),
  ];
  const originalOrder = items.map((item) => item.id);
  assert.deepEqual(
    sortShopBrands(items, "ranking").map((item) => item.id),
    [
      "national-3",
      "national-20",
      "regional-2-a",
      "regional-2-z",
      "regional-5",
      "other-a",
      "regional-6",
      "other-z",
    ],
  );
  assert.deepEqual(
    items.map((item) => item.id),
    originalOrder,
  );
});

test("ranking order stays selected when searching and handles missing rankings", () => {
  const items = [
    relation("exact", "さけ", { sakenowa_rank: 20 }),
    relation("partial", "さけのわ", { sakenowa_rank: 3 }),
    relation("null", "い", { sakenowa_rank: null, sakenowa_area_rank: null }),
    relation("missing", "あ"),
  ];
  assert.deepEqual(
    sortShopBrands(items, "ranking", "さけ").map((item) => item.id),
    ["partial", "exact", "missing", "null"],
  );
  assert.deepEqual(
    sortShopBrands(items, "brand", "さけ")
      .slice(0, 2)
      .map((item) => item.id),
    ["exact", "partial"],
  );
});

test("ranking tags show national rank first or a short region name for the top five", () => {
  const tag = (fields: Partial<Brand>) =>
    shopBrandRankingTag(relation("brand", "さけ", fields).brands);
  assert.deepEqual(tag({ sakenowa_rank: 64, sakenowa_area_rank: 1 }), {
    kind: "national",
    label: "全国64位",
  });
  assert.deepEqual(
    tag({ sakenowa_area_rank: 3, sakenowa_area_name: "福井県" }),
    {
      kind: "regional",
      label: "福井3位",
    },
  );
  assert.deepEqual(
    tag({ sakenowa_area_rank: 5, sakenowa_area_name: "北海道" }),
    {
      kind: "regional",
      label: "北海道5位",
    },
  );
  assert.deepEqual(tag({ sakenowa_area_rank: 2 }), {
    kind: "regional",
    label: "地域2位",
  });
  assert.equal(tag({ sakenowa_area_rank: 6 }), null);
  assert.equal(tag({ sakenowa_rank: null, sakenowa_area_rank: null }), null);
  assert.equal(tag({}), null);
});
