import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicDetails,
  type PublicRelation,
} from "../scripts/public-details";
import { publicMetadata } from "../src/lib/seo";

test("public snapshot links only listed records and distinguishes available relations", () => {
  const brand = {
    id: "brand",
    name: "試験酒",
    name_kana: null,
    brewery_id: "brewery",
  };
  const brewery = {
    id: "brewery",
    name: "試験酒造",
    name_kana: null,
    prefecture: "東京都",
  };
  const shop = {
    id: "shop",
    name: "試験酒店",
    name_kana: "",
    prefecture: "東京都",
    city: "港区",
    is_active: true,
  };
  const relation: PublicRelation = {
    id: "relation",
    shop_id: "shop",
    brand_id: "brand",
    is_active: true,
    status: "available",
    first_seen_at: null,
    last_seen_at: null,
  };
  for (const status of ["available", "unavailable"] as const) {
    const snapshot = buildPublicDetails(
      [shop],
      [brand],
      [brewery],
      [
        { ...relation, status },
        { ...relation, id: "disabled", is_active: false },
        { ...relation, id: "incorrect", status: "incorrect" },
        { ...relation, id: "missing-brand", brand_id: "not-public" },
        { ...relation, id: "missing-shop", shop_id: "not-public" },
      ],
      [{ shop_id: "shop" }, { shop_id: "not-public" }],
    );
    assert.equal(snapshot.shops.shop.relations.length, 1);
    assert.equal(
      snapshot.shops.shop.relations[0].brands.breweries?.name,
      "試験酒造",
    );
    assert.equal(snapshot.shops.shop.commentCount, 1);
    assert.equal(
      snapshot.brands.brand.shops.length,
      status === "available" ? 1 : 0,
    );
    assert.equal(snapshot.breweries.brewery.brands[0].name, "試験酒");
  }
});

test("detail metadata identifies its own URL and entity in search and social tags", () => {
  const result = publicMetadata(
    "/shops/test",
    "試験酒店｜東京都",
    "店舗の取扱銘柄",
  );
  assert.equal(result.alternates?.canonical, "/shops/test");
  assert.deepEqual(result.title, {
    absolute: "試験酒店｜東京都 - さけのありか",
  });
  assert.equal(result.openGraph?.url, "/shops/test");
  assert.equal(result.twitter?.description, "店舗の取扱銘柄");
});
