import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DirectoryCard } from "../src/components/directory-card";
import type { Brand, Brewery, Shop } from "../src/lib/types";

const brewery: Brewery = {
  id: "brewery-id",
  name: "試験酒造",
  name_kana: "しけんしゅぞう",
  prefecture: "長野県",
};
const brand: Brand = {
  id: "brand-id",
  name: "試験の酒",
  name_kana: "しけんのさけ",
  brewery_id: brewery.id,
  breweries: brewery,
  registration_status: "pending",
};

test("brand cards retain the pending badge, reading and non-link shop count", () => {
  const $ = load(
    renderToStaticMarkup(
      createElement(DirectoryCard, {
        type: "brand",
        item: brand,
        returnTo: "/brands?prefectures=長野県",
        relatedCount: 0,
        error: false,
        onFilterChange: () => undefined,
      }),
    ),
  );
  assert.equal($("article > .directory-pending-badge").text().trim(), "申請中");
  assert.equal($(".brand-item-kana").text(), "しけんのさけ");
  assert.equal($(".directory-related-count").text(), "取扱 0店");
  assert.equal($("a.directory-related-count").length, 0);
  const href = new URL(
    $(".brand-name-link").attr("href")!,
    "https://example.test",
  );
  assert.equal(href.pathname, "/brands/brand-id");
  assert.equal(
    href.searchParams.get("return_to"),
    "/brands?prefectures=長野県",
  );
});

test("shop cards keep their count separate from the name and reading", () => {
  const shop: Shop = {
    id: "shop-id",
    name: "試験酒店",
    name_kana: "しけんさけてん",
    prefecture: "長野県",
    city: "長野市",
    latitude: null,
    longitude: null,
    is_active: true,
  };
  const $ = load(
    renderToStaticMarkup(
      createElement(DirectoryCard, {
        type: "shop",
        item: shop,
        returnTo: "/shops?page=2",
        relatedCount: 122,
        error: false,
        onFilterChange: () => undefined,
      }),
    ),
  );
  assert.equal(
    $(
      ".directory-shop-item .brand-item-copy > .directory-related-count",
    ).text(),
    "取扱銘柄 122件",
  );
  assert.equal($(".brand-item-name .directory-related-count").length, 0);
  assert.equal($(".brand-item-kana").text(), "しけんさけてん");
});

test("brewery cards show linked brand names without brand readings", () => {
  const $ = load(
    renderToStaticMarkup(
      createElement(DirectoryCard, {
        type: "brewery",
        item: brewery,
        returnTo: "/breweries?q=試験",
        breweryBrands: [
          { id: brand.id, name: brand.name, brewery_id: brewery.id },
        ],
        error: false,
        onFilterChange: () => undefined,
      }),
    ),
  );
  assert.equal($(".directory-brewery-brands").text(), brand.name);
  assert.equal($(".directory-brewery-brands .brand-item-kana").length, 0);
  const href = new URL(
    $(".directory-brewery-brands a").attr("href")!,
    "https://example.test",
  );
  assert.equal(href.searchParams.get("return_to"), "/breweries?q=試験");
});

test("missing related data is not shown as zero or an empty brand list", () => {
  for (const error of [false, true]) {
    const common = {
      returnTo: "/brands",
      error,
      onFilterChange: () => undefined,
    };
    const count = load(
      renderToStaticMarkup(
        createElement(DirectoryCard, { ...common, type: "brand", item: brand }),
      ),
    );
    assert.equal(
      count(".directory-related-count").text(),
      error ? "取扱 不明" : "取扱 確認中",
    );
    const names = load(
      renderToStaticMarkup(
        createElement(DirectoryCard, {
          ...common,
          type: "brewery",
          item: brewery,
        }),
      ),
    );
    assert.equal(
      names(".directory-brewery-brands-status").text(),
      error ? "銘柄を取得できませんでした" : "銘柄を確認中…",
    );
  }
  const $ = load(
    renderToStaticMarkup(
      createElement(DirectoryCard, {
        type: "brewery",
        item: brewery,
        returnTo: "/breweries",
        error: false,
        breweryBrands: [],
        onFilterChange: () => undefined,
      }),
    ),
  );
  assert.equal($(".directory-brewery-brands-status").text(), "登録銘柄なし");
});
