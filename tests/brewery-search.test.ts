import assert from "node:assert/strict";
import test from "node:test";
import { prioritizeBrewerySearchResults } from "../src/lib/brewery-search";
import type { Brewery } from "../src/lib/types";

function brewery(id: string, name: string, nameKana: string): Brewery {
  return {
    id,
    name,
    name_kana: nameKana,
    prefecture: null,
  };
}

test("exact brewery kana matches are kept within the five visible results", () => {
  const results = [
    brewery("1", "泉酒造店", "いずみしゅぞうてん"),
    brewery("2", "泉谷酒造", "いずみやしゅぞう"),
    brewery("3", "泉川酒造", "いずみかわしゅぞう"),
    brewery("4", "泉屋酒造", "いずみやしゅぞう"),
    brewery("5", "泉本酒造", "いずみもとしゅぞう"),
    brewery("6", "泉酒造", "いずみしゅぞう"),
  ];

  const visible = prioritizeBrewerySearchResults(results, "いずみしゅぞう");

  assert.equal(visible.length, 5);
  assert.equal(visible[0].name, "泉酒造");
});

test("brewery search keeps the original order for equally ranked results", () => {
  const results = [
    brewery("1", "試験酒造A", "しけんしゅぞう"),
    brewery("2", "試験酒造B", "しけんしゅぞう"),
  ];

  assert.deepEqual(
    prioritizeBrewerySearchResults(results, "しけんしゅぞう").map(
      (item) => item.id,
    ),
    ["1", "2"],
  );
});
