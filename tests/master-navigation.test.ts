import { test } from "node:test";
import assert from "node:assert/strict";
import {
  masterDetailHref,
  masterReturnPath,
} from "../src/lib/master-navigation";

const brandId = "12958fa6-062a-4b2e-9962-49e859a69b7c";
const breweryId = "b227e9b6-6536-4a88-9a3a-80c186d2b8b4";

test("master links preserve the originating detail and its return context", () => {
  const brand = `/edit/brand/${brandId}?return_to=%2Fbrands`;
  const brewery = masterDetailHref("brewery", breweryId, brand);
  const breweryReturn = new URL(
    brewery,
    "https://example.test",
  ).searchParams.get("return_to");
  assert.equal(masterReturnPath(breweryReturn), brand);
  const linkedBrand = masterDetailHref("brand", brandId, brewery);
  assert.equal(
    masterReturnPath(
      new URL(linkedBrand, "https://example.test").searchParams.get(
        "return_to",
      ),
    ),
    brewery,
  );
});

test("master return paths retain list searches and shop posting context", () => {
  for (const path of [
    "/brands",
    "/edit",
    "/edit?type=brand&q=%E5%B8%82",
    `/edit/brand/${brandId}?shop_id=${breweryId}`,
  ]) {
    assert.equal(masterReturnPath(path), path);
  }
});

test("a shop brand link returns to the original public shop page", () => {
  const shopId = "bca49123-5243-414c-aa93-86a9773894a8";
  const shop = `/shops/${shopId}`;
  const href = masterDetailHref("brand", brandId, shop);
  assert.equal(
    new URL(href, "https://example.test").pathname,
    `/edit/brand/${brandId}`,
  );
  assert.equal(
    masterReturnPath(
      new URL(href, "https://example.test").searchParams.get("return_to"),
    ),
    shop,
  );
  assert.equal(masterReturnPath(`${shop}?tab=brands`), `${shop}?tab=brands`);
});

test("a brand information link returns to shop brand editing", () => {
  const post = `/post?shop_id=${breweryId}`;
  const href = masterDetailHref("brand", brandId, post);
  assert.equal(
    masterReturnPath(
      new URL(href, "https://example.test").searchParams.get("return_to"),
    ),
    post,
  );
});

test("master return paths reject external, malformed and unrelated destinations", () => {
  for (const path of [
    undefined,
    null,
    "",
    "https://evil.test/edit",
    "//evil.test/edit",
    "/\\evil.test/edit",
    "/edit\n?type=brand",
    "/shops/unknown",
    "/post",
    "/post?shop_id=invalid",
    "/post?shop_id=https://evil.test",
    "/edit/brand/invalid",
    "/edit/brewery/new",
    "/edit/../brands",
  ]) {
    assert.equal(masterReturnPath(path), undefined);
  }
});
