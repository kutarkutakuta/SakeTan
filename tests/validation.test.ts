import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeNext,
  changedFields,
  googleMapsShopUrl,
  hasUsableCoordinates,
} from "../src/lib/utils";
import {
  actionSchema,
  masterSchemas,
  observedDate,
} from "../src/lib/validation";
import { trustedRequestOrigin } from "../src/lib/request-origin";
import { featuredShopBrands } from "../src/lib/shop-brand-order";
import { kanaGroup, sortShopBrands } from "../src/lib/brand-index";
import { contributionAchievement } from "../src/lib/contribution";
import {
  brandRow,
  breweryRow,
  brandSchema,
  namedRows,
  rankingSchema,
} from "../scripts/sakenowa-data";
test("OAuth return path stays on origin", () => {
  for (const url of [
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
  ])
    assert.equal(safeNext(url), "/");
  assert.equal(safeNext("/post?shop_id=abc"), "/post?shop_id=abc");
});
test("mutation origin accepts configured proxies and browser same-origin metadata", () => {
  assert.equal(
    trustedRequestOrigin(
      new Request("http://internal:3000/api/action", {
        headers: { origin: "https://saketan.example" },
      }),
      "https://saketan.example",
    ),
    true,
  );
  assert.equal(
    trustedRequestOrigin(
      new Request("http://internal:3000/api/action", {
        headers: {
          origin: "https://saketan.example",
          "x-forwarded-host": "saketan.example",
          "x-forwarded-proto": "https",
        },
      }),
      undefined,
    ),
    true,
  );
  assert.equal(
    trustedRequestOrigin(
      new Request("http://internal:3000/api/action", {
        headers: { "sec-fetch-site": "same-origin" },
      }),
      undefined,
    ),
    true,
  );
  assert.equal(
    trustedRequestOrigin(
      new Request("http://internal:3000/api/action", {
        headers: {
          origin: "https://evil.invalid",
          "sec-fetch-site": "cross-site",
        },
      }),
      "https://saketan.example",
    ),
    false,
  );
  assert.equal(
    trustedRequestOrigin(
      new Request("http://internal:3000/api/action"),
      "https://saketan.example",
    ),
    false,
  );
});
test("history only displays changed editable fields", () => {
  assert.deepEqual(
    changedFields(
      { name: "A", updated_at: "old" },
      { name: "B", updated_at: "new" },
    ),
    ["name"],
  );
});
test("validation rejects unsafe URL, invalid coordinates, future or nonexistent dates", () => {
  assert.equal(
    masterSchemas.brewery.safeParse({
      name: "A",
      name_kana: null,
      prefecture: null,
      website_url: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(observedDate.safeParse("2999-01-01").success, false);
  assert.equal(observedDate.safeParse("2026-02-30").success, false);
  assert.equal(
    masterSchemas.shop.safeParse({
      name: "A",
      name_kana: "えー",
      prefecture: "東京都",
      city: "区",
      latitude: 91,
      longitude: 139,
    }).success,
    false,
  );
  assert.equal(
    masterSchemas.shop.safeParse({
      name: "取込酒店",
      name_kana: null,
      prefecture: "北海道",
      city: null,
      latitude: null,
      longitude: null,
    }).success,
    false,
  );
  assert.equal(
    masterSchemas.shop.safeParse({
      name: "地図酒店",
      name_kana: "ちずさかてん",
      prefecture: null,
      city: null,
      latitude: 35.68,
      longitude: 139.76,
      google_place_id: "place-1",
    }).success,
    true,
  );
  assert.equal(
    masterSchemas.shop.safeParse({
      name: "地図酒店",
      name_kana: "ちずさかてん",
      prefecture: null,
      city: null,
      latitude: 35.68,
      longitude: 139.76,
      website_url: "https://example.com/",
    }).success,
    false,
  );
});
test("Google Maps shop links prefer a Place ID", () => {
  const url = new URL(
    googleMapsShopUrl({
      name: "地図酒店",
      prefecture: null,
      city: null,
      google_place_id: "place-1",
    }),
  );
  assert.equal(url.searchParams.get("query"), "地図酒店");
  assert.equal(url.searchParams.get("query_place_id"), "place-1");
});
test("Google coordinates expire after 30 days while independent coordinates remain usable", () => {
  const now = Date.parse("2026-09-11T00:00:00Z");
  const point = { latitude: 35.68, longitude: 139.76 };
  assert.equal(hasUsableCoordinates(point, now), true);
  assert.equal(
    hasUsableCoordinates(
      {
        ...point,
        geocode_source: "google",
        geocoded_at: "2026-08-13T00:00:01Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    hasUsableCoordinates(
      {
        ...point,
        geocode_source: "google",
        geocoded_at: "2026-08-11T00:00:00Z",
      },
      now,
    ),
    false,
  );
});
test("import resolves prefecture and nullable brewery without guessing kana or URLs", () => {
  assert.deepEqual(
    breweryRow({ id: 1, name: "酒造", areaId: 20 }, new Map([[20, "長野県"]])),
    { source: "sakenowa", source_id: "1", name: "酒造", prefecture: "長野県" },
  );
  const row = brandRow({ id: 2, name: "銘柄", breweryId: "" }, new Map());
  assert.equal(row.brewery_id, null);
  assert.equal("external_url" in row, false);
  assert.equal("name_kana" in row, false);
  assert.equal(
    brandSchema.safeParse({
      brands: [{ id: 2, name: "銘柄", breweryId: null }],
    }).success,
    true,
  );
});
test("blank external master names are skipped without invented replacements", () => {
  assert.deepEqual(
    namedRows([
      { id: 1, name: "" },
      { id: 2, name: "酒蔵" },
    ]),
    [{ id: 2, name: "酒蔵" }],
  );
});
test("Sakenowa overall rankings validate rank, score and target month", () => {
  assert.equal(
    rankingSchema.safeParse({
      yearMonth: "202609",
      overall: [{ rank: 1, score: 4.5, brandId: 109 }],
      areas: [
        {
          areaId: 5,
          ranking: [{ rank: 1, score: 4.2, brandId: 109 }],
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    rankingSchema.safeParse({
      yearMonth: "2026-09",
      overall: [{ rank: 0, score: 6, brandId: 109 }],
      areas: [],
    }).success,
    false,
  );
});

test("map pin brands prioritize Sakenowa rank, then recent sightings", () => {
  const brand = (id: string, rank: number | null = null) => ({
    id,
    name: id,
    name_kana: null,
    brewery_id: null,
    sakenowa_rank: rank,
  });
  const result = featuredShopBrands([
    { last_seen_at: "2026-09-12", brands: brand("recent") },
    { last_seen_at: "2026-01-01", brands: brand("rank-20", 20) },
    { last_seen_at: "2025-01-01", brands: brand("rank-3", 3) },
    { last_seen_at: "2026-06-01", brands: brand("older") },
  ]);

  assert.deepEqual(
    result.map((item) => item.id),
    ["rank-3", "rank-20", "recent", "older"],
  );
});

test("brand indexes handle hiragana, katakana and unregistered readings", () => {
  assert.equal(kanaGroup("さくら"), "さ");
  assert.equal(kanaGroup("ハナビ"), "は");
  assert.equal(kanaGroup("獺祭"), "other");
});

test("shop brand status action accepts only the three public statuses", () => {
  const input = {
    kind: "shop_brand_status",
    shop_id: "10000000-0000-4000-8000-000000000001",
    brand_id: "10000000-0000-4000-8000-000000000002",
    status: "available",
    reason: null,
  };
  for (const status of ["available", "unavailable", "incorrect"])
    assert.equal(actionSchema.safeParse({ ...input, status }).success, true);
  assert.equal(
    actionSchema.safeParse({ ...input, status: "unknown" }).success,
    false,
  );
});

test("shop brand copy accepts one to ten destination shops", () => {
  const input = {
    kind: "shop_brand_copy",
    source_shop_id: "10000000-0000-4000-8000-000000000001",
    target_shop_ids: ["10000000-0000-4000-8000-000000000002"],
  };
  assert.equal(actionSchema.safeParse(input).success, true);
  assert.equal(
    actionSchema.safeParse({ ...input, target_shop_ids: [] }).success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({
      ...input,
      target_shop_ids: Array.from(
        { length: 11 },
        (_, index) =>
          `10000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      ),
    }).success,
    false,
  );
});

test("master kana action only accepts existing brand and brewery readings", () => {
  const input = {
    kind: "master_kana",
    type: "brand",
    id: "10000000-0000-4000-8000-000000000002",
    name_kana: "ためしのさけ",
    reason: null,
  };
  assert.equal(actionSchema.safeParse(input).success, true);
  assert.equal(
    actionSchema.safeParse({ ...input, type: "brewery", name_kana: null })
      .success,
    true,
  );
  assert.equal(
    actionSchema.safeParse({ ...input, type: "shop" }).success,
    false,
  );
  assert.equal(
    actionSchema.safeParse({ ...input, name_kana: "あ".repeat(151) }).success,
    false,
  );
});

test("shop brands sort by Japanese catalog fields", () => {
  const item = (
    id: string,
    name: string,
    brewery: string,
    prefecture: string,
  ) => ({
    id,
    shop_id: "shop",
    brand_id: id,
    is_active: true,
    status: "available" as const,
    first_seen_at: null,
    last_seen_at: null,
    brands: {
      id,
      name,
      name_kana: name,
      brewery_id: id,
      breweries: {
        id,
        name: brewery,
        name_kana: brewery,
        prefecture,
      },
    },
  });
  const items = [
    item("1", "かぜ", "あ酒造", "山形県"),
    item("2", "あめ", "か酒造", "秋田県"),
  ];
  assert.deepEqual(
    sortShopBrands(items, "brand").map((value) => value.id),
    ["2", "1"],
  );
  assert.deepEqual(
    sortShopBrands(items, "brewery").map((value) => value.id),
    ["1", "2"],
  );
});

test("contribution achievements advance on valid shop-brand totals", () => {
  assert.deepEqual(contributionAchievement(0), {
    name: "最初の登録に挑戦",
    next: { target: 1, name: "はじめの一献" },
    value: 0,
    target: 1,
  });
  assert.equal(contributionAchievement(12).name, "酒屋めぐり");
  assert.equal(contributionAchievement(12).next?.name, "地酒案内人");
  assert.equal(contributionAchievement(100).name, "さけたん名人");
  assert.equal(contributionAchievement(100).next, undefined);
});
