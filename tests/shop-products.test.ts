import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReviewItems,
  extractProducts,
  matchProduct,
  normalizeProductName,
  paginationLinks,
} from "../scripts/shop-products/parser";
import type {
  CatalogBrand,
  ExtractedProduct,
} from "../scripts/shop-products/types";

const catalog: CatalogBrand[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "獺祭",
    nameKana: "だっさい",
    breweryName: "旭酒造",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "写楽",
    nameKana: "しゃらく",
    breweryName: "宮泉銘醸",
  },
];

test("shop product parser prefers structured product data and removes duplicates", () => {
  const html =
    '<script type="application/ld+json">' +
    '{"@context":"https://schema.org","@type":"ItemList","itemListElement":[' +
    '{"@type":"Product","name":"獺祭 純米大吟醸45 720ml","url":"/products/dassai-45"}' +
    "]}</script>" +
    '<article class="product-card">' +
    '<a href="/products/dassai-45"><h2 class="product-name">獺祭 純米大吟醸45 720ml</h2></a>' +
    '<span class="price">2,000円</span></article>';
  const products = extractProducts(html, "https://shop.example/items");
  assert.deepEqual(products, [
    {
      sourceName: "獺祭 純米大吟醸45 720ml",
      sourceUrl: "https://shop.example/products/dassai-45",
      pageUrl: "https://shop.example/items",
      method: "json-ld",
    },
  ]);
});

test("shop product parser supports a site-specific selector", () => {
  const products = extractProducts(
    '<div class="catalog"><a href="/p/1"><span data-sake> 写楽　純米吟醸 </span></a></div>',
    "https://shop.example/list",
    "[data-sake]",
  );
  assert.deepEqual(products, [
    {
      sourceName: "写楽 純米吟醸",
      sourceUrl: "https://shop.example/p/1",
      pageUrl: "https://shop.example/list",
      method: "selector",
    },
  ]);
});

test("shop product parser recognizes dense brand and brewery tables", () => {
  const row = (brands: string, brewery: string) =>
    "<tr><td>" + brands + "</td><td>" + brewery + "</td></tr>";
  const products = extractProducts(
    "<table>" +
      row("田酒　喜久泉　善知鳥", "西田酒造") +
      row("陸奥八仙", "八戸酒造") +
      row("新政　No.6", "新政酒造") +
      row("山本", "山本酒造") +
      row("雪の茅舎", "齋彌酒造店") +
      "</table>",
    "https://shop.example/brands",
  );
  assert.deepEqual(
    products
      .map((product) => product.sourceName)
      .sort((a, b) => a.localeCompare(b, "ja")),
    [
      "No.6",
      "喜久泉",
      "山本",
      "新政",
      "田酒",
      "善知鳥",
      "陸奥八仙",
      "雪の茅舎",
    ].sort((a, b) => a.localeCompare(b, "ja")),
  );
  assert.ok(products.every((product) => product.method === "brand-table"));
});

test("pagination follows only links identified as next", () => {
  const links = paginationLinks(
    '<nav class="pagination">' +
      '<a href="?page=1">1</a>' +
      '<a href="?page=2">次の48件 &raquo;</a>' +
      "</nav>" +
      '<a href="/contact">お問い合わせ</a>',
    "https://shop.example/items?page=1",
  );
  assert.deepEqual(links, ["https://shop.example/items?page=2"]);
});

test("brand matching distinguishes exact, suggested, and unmatched names", () => {
  const product = (sourceName: string): ExtractedProduct => ({
    sourceName,
    sourceUrl: null,
    pageUrl: "https://shop.example/items",
    method: "selector",
  });
  assert.equal(matchProduct(product("獺祭"), catalog).matchKind, "exact");
  assert.equal(
    matchProduct(product("旭酒造 獺祭 純米大吟醸45 720ml"), catalog).matchKind,
    "suggested",
  );
  assert.equal(
    matchProduct(product("未登録の日本酒"), catalog).matchKind,
    "unmatched",
  );
  assert.equal(normalizeProductName(" 獺祭・純米大吟醸 "), "獺祭純米大吟醸");
});

test("brand matching rejects generic sake terms and cross-token false positives", () => {
  const product: ExtractedProduct = {
    sourceName: "聖 山田錦50 純米吟醸 720ml",
    sourceUrl: null,
    pageUrl: "https://shop.example/items",
    method: "selector",
  };
  const misleadingCatalog: CatalogBrand[] = [
    {
      id: "10000000-0000-4000-8000-000000000003",
      name: "聖山",
      nameKana: null,
      breweryName: "長野銘醸",
    },
    {
      id: "10000000-0000-4000-8000-000000000004",
      name: "純米吟醸",
      nameKana: null,
      breweryName: null,
    },
  ];
  assert.equal(matchProduct(product, misleadingCatalog).matchKind, "unmatched");
});

test("brand matching normalizes traditional variants and table abbreviations", () => {
  const product = (sourceName: string): ExtractedProduct => ({
    sourceName,
    sourceUrl: null,
    pageUrl: "https://shop.example/brands",
    method: "brand-table",
  });
  const variantCatalog: CatalogBrand[] = [
    {
      id: "10000000-0000-4000-8000-000000000005",
      name: "國権",
      nameKana: null,
      breweryName: "国権酒造",
    },
    {
      id: "10000000-0000-4000-8000-000000000006",
      name: "冩楽",
      nameKana: null,
      breweryName: "宮泉銘醸",
    },
    {
      id: "10000000-0000-4000-8000-000000000007",
      name: "Ohmine Junmai",
      nameKana: null,
      breweryName: "大嶺酒造",
    },
  ];
  assert.equal(
    matchProduct(product("国権"), variantCatalog).matchKind,
    "exact",
  );
  assert.equal(
    matchProduct(product("寫楽"), variantCatalog).matchKind,
    "exact",
  );
  assert.equal(
    matchProduct(product("Ohmine"), variantCatalog).matchKind,
    "suggested",
  );
});

test("brand matching ignores bracketed labels and regional descriptions", () => {
  const product = (sourceName: string): ExtractedProduct => ({
    sourceName,
    sourceUrl: null,
    pageUrl: "https://shop.example/items",
    method: "heuristic",
  });
  const descriptiveCatalog: CatalogBrand[] = [
    {
      id: "10000000-0000-4000-8000-000000000010",
      name: "幻の酒",
      nameKana: null,
      breweryName: "EH酒造",
    },
    {
      id: "10000000-0000-4000-8000-000000000011",
      name: "蓬莱泉",
      nameKana: null,
      breweryName: "関谷醸造",
    },
    {
      id: "10000000-0000-4000-8000-000000000012",
      name: "越後",
      nameKana: null,
      breweryName: "新潟銘醸",
    },
    {
      id: "10000000-0000-4000-8000-000000000013",
      name: "八海山",
      nameKana: null,
      breweryName: "八海醸造",
    },
  ];
  assert.equal(
    matchProduct(
      product("【幻の酒】蓬莱泉 純米大吟醸「空」720ml"),
      descriptiveCatalog,
    ).candidates[0].brandName,
    "蓬莱泉",
  );
  assert.equal(
    matchProduct(
      product("越後の地酒「八海山 純米吟醸」1800ml"),
      descriptiveCatalog,
    ).candidates[0].brandName,
    "八海山",
  );
});

test("review candidates always require explicit approval", () => {
  const items = buildReviewItems(
    [
      {
        sourceName: "獺祭",
        sourceUrl: null,
        pageUrl: "https://shop.example/items",
        method: "json-ld",
      },
    ],
    catalog,
  );
  assert.equal(items[0].matchKind, "exact");
  assert.equal(items[0].brandId, catalog[0].id);
  assert.equal(items[0].approved, false);
});

test("review candidates are ordered by matched brand then source name", () => {
  const ordered = buildReviewItems(
    [
      {
        sourceName: "Zulu",
        sourceUrl: null,
        pageUrl: "https://shop.example/items",
        method: "json-ld",
      },
      {
        sourceName: "Alpha",
        sourceUrl: null,
        pageUrl: "https://shop.example/items",
        method: "json-ld",
      },
    ],
    [
      {
        id: "10000000-0000-4000-8000-000000000008",
        name: "Zulu",
        nameKana: null,
        breweryName: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000009",
        name: "Alpha",
        nameKana: null,
        breweryName: null,
      },
    ],
  );
  assert.deepEqual(
    ordered.map((item) => item.candidates[0].brandName),
    ["Alpha", "Zulu"],
  );
});
