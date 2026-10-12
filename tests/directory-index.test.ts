import assert from "node:assert/strict";
import test from "node:test";
import {
  directoryFilters,
  directoryPage,
  directorySearchParams,
} from "../src/lib/directory-index";
import type { Brand, Brewery, Shop } from "../src/lib/types";

function brand(index: number, fields: Partial<Brand> = {}): Brand {
  return {
    id: String(index),
    name: `銘柄${index}`,
    name_kana: `さけ${String(index).padStart(3, "0")}`,
    brewery_id: "brewery",
    registration_status: "approved",
    breweries: {
      id: "brewery",
      name: "新潟酒造",
      name_kana: "にいがたしゅぞう",
      prefecture: "新潟県",
    },
    ...fields,
  };
}

test("directory searches filter the full catalog before pagination, including later matches", () => {
  const items = Array.from({ length: 72 }, (_, index) => brand(index));
  const filters = directoryFilters(new URLSearchParams());
  const first = directoryPage("brand", items, filters);
  const second = directoryPage("brand", items, { ...filters, page: 2 });
  assert.equal(first.count, 72);
  assert.equal(first.items.length, 30);
  assert.equal(second.items.length, 30);
  assert.equal(second.start, 30);
  assert.equal(
    second.items.some((item) => first.items.includes(item)),
    false,
  );
  const found = directoryPage("brand", items, { ...filters, query: "銘柄71" });
  assert.deepEqual(
    found.items.map((item) => item.id),
    ["71"],
  );
  assert.equal(found.count, 1);
  assert.equal(
    directoryPage("brand", items, { ...filters, page: 999 }).items.length,
    12,
  );
});

test("status, prefecture and kana combine and requested brewery names remain searchable", () => {
  const items = [
    brand(1),
    brand(2, { name_kana: "かい", registration_status: "pending" }),
    brand(3, {
      brewery_id: null,
      breweries: null,
      requested_brewery_name: "申請酒造",
      name_kana: "しんせい",
      registration_status: "pending",
    }),
  ];
  const filters = directoryFilters(
    new URLSearchParams("status=pending&prefectures=新潟県&kana=か"),
  );
  assert.deepEqual(
    directoryPage("brand", items, filters).items.map((item) => item.id),
    ["2"],
  );
  assert.deepEqual(
    directoryPage(
      "brand",
      items,
      directoryFilters(new URLSearchParams("q=申請酒造&status=pending")),
    ).items.map((item) => item.id),
    ["3"],
  );
  assert.equal(
    directoryPage("brand", items, { ...filters, kana: new Set(["あ"]) }).count,
    0,
  );
  assert.equal(
    directoryPage("brand", items, {
      ...filters,
      kana: new Set(["な"]),
      targets: new Set(["brewery"]),
    }).count,
    1,
  );
});

test("filter URLs preserve selections and sanitize invalid values", () => {
  const filters = directoryFilters(
    new URLSearchParams(
      "q=酒造&status=pending&prefectures=新潟県,長野県&kana=さ,other&targets=brewery&sort=region&page=2",
    ),
  );
  assert.deepEqual(directoryFilters(directorySearchParams(filters)), filters);
  const invalid = directoryFilters(
    new URLSearchParams(
      "status=unknown&sort=unknown&prefectures=unknown&kana=unknown&page=NaN",
    ),
  );
  assert.equal(invalid.status, "all");
  assert.equal(invalid.sort, "ranking");
  assert.equal(invalid.page, 1);
  assert.equal(invalid.prefectures.size, 0);
  assert.equal(invalid.kana.size, 0);
  const emptyTargets = directoryFilters(new URLSearchParams("targets="));
  assert.equal(
    directoryFilters(directorySearchParams(emptyTargets)).targets.size,
    0,
  );
});

test("brand ranking is the default and stays in order when a text search is applied", () => {
  const filters = directoryFilters(new URLSearchParams());
  assert.equal(filters.sort, "ranking");
  assert.equal(directorySearchParams(filters).has("sort"), false);
  const items = [
    brand(1, { name: "酒", sakenowa_rank: 20 }),
    brand(2, { name: "酒蔵の酒", sakenowa_rank: 3 }),
    brand(3, { name: "県のお酒", sakenowa_area_rank: 1 }),
    brand(4, { name: "酒", sakenowa_area_rank: 6 }),
  ];
  assert.deepEqual(
    directoryPage("brand", items, { ...filters, query: "酒" }).items.map(
      (item) => item.id,
    ),
    ["2", "1", "3", "4"],
  );
  const alphabetical = { ...filters, sort: "brand" as const };
  assert.equal(directorySearchParams(alphabetical).get("sort"), "brand");
  assert.equal(
    directoryFilters(directorySearchParams(alphabetical)).sort,
    "brand",
  );
  for (const type of ["brewery", "shop"] as const) {
    const otherFilters = directoryFilters(new URLSearchParams(), type);
    assert.equal(otherFilters.sort, "brand");
    assert.equal(directorySearchParams(otherFilters, type).has("sort"), false);
  }
});

test("brewery and shop directories filter names and locations with the same paging rules", () => {
  const breweries: Brewery[] = [
    {
      id: "1",
      name: "新潟酒造",
      name_kana: "ニイガタシュゾウ",
      prefecture: "新潟県",
    },
    {
      id: "2",
      name: "長野酒造",
      name_kana: "ながのしゅぞう",
      prefecture: "長野県",
    },
  ];
  const filters = directoryFilters(
    new URLSearchParams("prefectures=新潟県&kana=な"),
  );
  assert.deepEqual(
    directoryPage("brewery", breweries, filters).items.map((item) => item.id),
    ["1"],
  );
  const shops: Shop[] = [
    {
      id: "1",
      name: "日本酒の店",
      name_kana: "にほんしゅのみせ",
      prefecture: "東京都",
      city: "杉並区",
      latitude: null,
      longitude: null,
      is_active: true,
    },
  ];
  assert.equal(
    directoryPage(
      "shop",
      shops,
      directoryFilters(new URLSearchParams("q=杉並")),
    ).count,
    1,
  );
  const empty = directoryPage("shop", [], { ...filters, page: 999 });
  assert.equal(empty.page, 1);
  assert.equal(empty.items.length, 0);
});
