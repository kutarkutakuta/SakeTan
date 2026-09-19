import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoApproveReviewItems,
  buildReviewItems,
  canonicalizeCatalogPrefixProducts,
  extractPdfTextProducts,
  extractProducts,
  matchProduct,
  normalizeProductName,
  paginationLinks,
  profileLinks,
  uniqueApprovedReviewItems,
} from "../scripts/shop-products/parser";
import type {
  CatalogBrand,
  ExtractedProduct,
} from "../scripts/shop-products/types";
import {
  profileAllowsName,
  sourceProfileFor,
} from "../scripts/shop-products/profiles";

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
      sourceBreweryName: null,
      sourceUrl: "https://shop.example/products/dassai-45",
      pageUrl: "https://shop.example/items",
      pageNumber: null,
      evidence: "獺祭 純米大吟醸45 720ml",
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
      sourceBreweryName: null,
      sourceUrl: "https://shop.example/p/1",
      pageUrl: "https://shop.example/list",
      pageNumber: null,
      evidence: "写楽 純米吟醸",
      method: "selector",
    },
  ]);
});

test("shop product parser reads storefront categories with brewery context", () => {
  const products = extractProducts(
    '<link rel="chapter" href="/?category_id=1" title="鶴齢/雪男【新潟 青木酒造】 | CATEGORY">' +
      '<link rel="chapter" href="/?category_id=2" title="クラフトビール | CATEGORY">',
    "https://shop.example/",
  );
  assert.deepEqual(
    products.map((product) => ({
      name: product.sourceName,
      brewery: product.sourceBreweryName,
      method: product.method,
    })),
    [
      { name: "雪男", brewery: "青木酒造", method: "category" },
      { name: "鶴齢", brewery: "青木酒造", method: "category" },
    ],
  );
});

test("source profiles reuse storefront exclusions", () => {
  const profile = sourceProfileFor("https://sample.stores.jp/items");
  assert.equal(profile?.name, "stores-category-navigation");
  assert.equal(profileAllowsName(profile, "風の森"), true);
  assert.equal(profileAllowsName(profile, "クラフトビール"), false);
});

test("source profiles can extract grouped brand and brewery rows", () => {
  const products = extractProducts(
    '<section class="maker"><p class="brewery">玉泉堂酒造</p><ul><li class="brand">醴泉</li></ul></section>',
    "https://shop.example/brands",
    undefined,
    {
      name: "grouped-test",
      itemContainerSelector: ".maker",
      brandSelector: ".brand",
      brewerySelector: ".brewery",
    },
  );
  assert.equal(products[0].sourceName, "醴泉");
  assert.equal(products[0].sourceBreweryName, "玉泉堂酒造");
});

test("source profiles can split multiple published brands in one row", () => {
  const products = extractProducts(
    '<table><tbody><tr><td class="brewery">青木酒造</td><td class="brand">鶴齢、雪男</td></tr></tbody></table>',
    "https://shop.example/brands",
    undefined,
    {
      name: "split-brand-test",
      itemContainerSelector: "tbody tr",
      brandSelector: ".brand",
      brandSplitPattern: "[、,，]",
      brewerySelector: ".brewery",
    },
  );
  assert.deepEqual(
    products.map((product) => [product.sourceName, product.sourceBreweryName]),
    [
      ["雪男", "青木酒造"],
      ["鶴齢", "青木酒造"],
    ],
  );
});

test("source profiles split brands separated by br elements", () => {
  const products = extractProducts(
    "<table><tbody><tr><td>青森県</td><td>陸奥八仙<br>田酒<BR>豊盃</td></tr></tbody></table>",
    "https://shop.example/nihonsyu.html",
    undefined,
    {
      name: "prefecture-table-test",
      itemContainerSelector: "tbody tr",
      brandSelector: "td:nth-child(2)",
      brandSplitPattern: "[\\r\\n]+",
    },
  );
  assert.deepEqual(
    products.map((product) => product.sourceName),
    ["田酒", "豊盃", "陸奥八仙"],
  );
});

test("source profiles can extract a brewery name from surrounding text", () => {
  const products = extractProducts(
    '<article><div class="brand">花巴 水酛純米 秋上がり</div><p class="details">花巴 水酛純米\n奈良県　　美吉野醸造\n720ml</p></article>',
    "https://shop.example/sake",
    undefined,
    {
      name: "brewery-pattern-test",
      itemContainerSelector: "article",
      brandSelector: ".brand",
      brewerySelector: ".details",
      breweryPattern: "(?:奈良県)[\\s　]+([^\\r\\n]+)",
    },
  );
  assert.equal(products[0].sourceName, "花巴 水酛純米 秋上がり");
  assert.equal(products[0].sourceBreweryName, "美吉野醸造");
});

test("PDF text extraction keeps page evidence and removes repeated lines", () => {
  const products = extractPdfTextProducts(
    [
      { pageNumber: 1, text: "獺祭\n写楽" },
      { pageNumber: 2, text: "獺祭\n" },
    ],
    "https://shop.example/list.pdf",
  );
  assert.deepEqual(
    products.map((product) => [product.sourceName, product.pageNumber]),
    [
      ["写楽", 1],
      ["獺祭", 1],
    ],
  );
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

test("pagination follows numbered links in WordPress pagenavi", () => {
  const links = paginationLinks(
    '<div class="wp-pagenavi" role="navigation">' +
      '<span class="current">1</span>' +
      '<a class="page larger" href="/page/2/?catnum=2">2</a>' +
      '<a class="last" href="/page/88/?catnum=2">88</a>' +
      "</div>",
    "https://shop.example/?catnum=2",
  );
  assert.deepEqual(links, [
    "https://shop.example/page/2/?catnum=2",
    "https://shop.example/page/88/?catnum=2",
  ]);
});

test("profile links can follow only prefecture brand groups", () => {
  const links = profileLinks(
    '<div id="group-list">' +
      '<a href="?mode=grp&gid=1">北海道「男山」</a>' +
      '<a href="?mode=grp&gid=2">最新入荷の日本酒</a>' +
      '<a href="?mode=grp&gid=3">秋田県「天寿」</a>' +
      "</div>",
    "https://www.jizakenoaono.com/?mode=cate&cbid=749860&csid=0",
    '#group-list a[href*="mode=grp"]',
    "^(?:北海道|秋田県)[「『]",
  );
  assert.deepEqual(links, [
    "https://www.jizakenoaono.com/?mode=grp&gid=1",
    "https://www.jizakenoaono.com/?mode=grp&gid=3",
  ]);
});

test("pagination prefers a filtered page link over an unfiltered canonical next link", () => {
  const links = paginationLinks(
    '<link rel="next" href="https://shop.example/page/3/">' +
      '<div class="wp-pagenavi"><a href="/page/3/?catnum=2">3</a></div>',
    "https://shop.example/page/2/?catnum=2",
  );
  assert.deepEqual(links, ["https://shop.example/page/3/?catnum=2"]);
});

test("pagination does not leave a filtered result through an unfiltered next link", () => {
  const links = paginationLinks(
    '<link rel="next" href="https://shop.example/page/89/">',
    "https://shop.example/page/88/?catnum=2",
  );
  assert.deepEqual(links, []);
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

test("trusted product catalogs canonicalize only brand-name prefixes", () => {
  const product = (sourceName: string): ExtractedProduct => ({
    sourceName,
    sourceUrl: null,
    pageUrl: "https://shop.example/items",
    method: "selector",
  });
  const prefixCatalog: CatalogBrand[] = [
    ...catalog,
    {
      id: "10000000-0000-4000-8000-000000000003",
      name: "総乃寒菊",
      nameKana: null,
      breweryName: "寒菊銘醸",
    },
    {
      id: "10000000-0000-4000-8000-000000000004",
      name: "NOTO",
      nameKana: null,
      breweryName: "数馬酒造",
    },
    {
      id: "10000000-0000-4000-8000-000000000005",
      name: "貴",
      nameKana: null,
      breweryName: "永山本家酒造場",
    },
  ];
  const canonicalized = canonicalizeCatalogPrefixProducts(
    [
      product("寒菊 Pray for NOTO あらせめ"),
      product("貴 特別純米60"),
      product("銘酒 NOTO 限定品"),
    ],
    prefixCatalog,
  );
  assert.deepEqual(
    canonicalized.map((item) => item.sourceName),
    ["総乃寒菊", "貴", "銘酒 NOTO 限定品"],
  );
});

test("trusted product catalogs reject partial and generic leading words", () => {
  const product = (sourceName: string): ExtractedProduct => ({
    sourceName,
    sourceUrl: null,
    pageUrl: "https://shop.example/items",
    method: "selector",
  });
  const prefixCatalog: CatalogBrand[] = [
    {
      id: "10000000-0000-4000-8000-000000000003",
      name: "Yu",
      nameKana: null,
      breweryName: "YK3",
    },
    {
      id: "10000000-0000-4000-8000-000000000004",
      name: "夏酒",
      nameKana: null,
      breweryName: "瑞鷹酒造",
    },
  ];
  const canonicalized = canonicalizeCatalogPrefixProducts(
    [
      product("YUKIOTOKO sake yell"),
      product("夏酒、人気銘柄入荷"),
      product("Yu・別銘柄 飲み比べ"),
    ],
    prefixCatalog,
  );
  assert.deepEqual(
    canonicalized.map((item) => item.sourceName),
    ["YUKIOTOKO sake yell", "夏酒、人気銘柄入荷", "Yu・別銘柄 飲み比べ"],
  );
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

test("automatic approval accepts exact and confirmed aliases once per brand", () => {
  const items = buildReviewItems(
    [
      {
        sourceName: "AKABU",
        sourceUrl: "https://shop.example/akabu-1",
        pageUrl: "https://shop.example/items",
        method: "selector",
      },
      {
        sourceName: "赤武",
        sourceUrl: "https://shop.example/akabu-2",
        pageUrl: "https://shop.example/items",
        method: "selector",
      },
      {
        sourceName: "獺祭 純米大吟醸45",
        sourceUrl: null,
        pageUrl: "https://shop.example/items",
        method: "selector",
      },
    ],
    [
      ...catalog,
      {
        id: "10000000-0000-4000-8000-000000000020",
        name: "AKABU",
        nameKana: null,
        breweryName: "赤武酒造",
      },
    ],
  );
  const approved = autoApproveReviewItems(items);
  assert.equal(approved.filter((item) => item.approved).length, 1);
  assert.equal(uniqueApprovedReviewItems(approved).length, 1);
  assert.equal(
    approved.find((item) => item.sourceName === "赤武")?.matchKind,
    "alias",
  );
  assert.equal(
    approved.find((item) => item.sourceName.startsWith("獺祭 "))?.approved,
    false,
  );
});

test("automatic approval requires structured evidence for one-character brands", () => {
  const oneCharacterCatalog: CatalogBrand[] = [
    {
      id: "10000000-0000-4000-8000-000000000021",
      name: "作",
      nameKana: "ざく",
      breweryName: "清水清三郎商店",
    },
  ];
  const unsafe = buildReviewItems(
    [
      {
        sourceName: "作",
        sourceUrl: null,
        pageUrl: "https://shop.example/items",
        method: "heuristic",
      },
    ],
    oneCharacterCatalog,
  );
  const safe = buildReviewItems(
    [
      {
        sourceName: "作",
        sourceBreweryName: "清水清三郎商店",
        sourceUrl: null,
        pageUrl: "https://shop.example/brands",
        method: "brand-table",
      },
    ],
    oneCharacterCatalog,
  );
  assert.equal(autoApproveReviewItems(unsafe)[0].approved, false);
  assert.equal(autoApproveReviewItems(safe)[0].approved, true);
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
