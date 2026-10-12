import assert from "node:assert/strict";
import test from "node:test";
import { registerBrewery } from "../src/lib/brewery-registration";

const id = "b227e9b6-6536-4a88-9a3a-80c186d2b8b4";
test("inline brewery registration returns a selectable brewery without saving or approving a brand", async () => {
  const calls: unknown[] = [];
  const brewery = await registerBrewery(
    {
      name: " 新しい酒造 ",
      nameKana: " あたらしいしゅぞう ",
      prefecture: "長野県",
      websiteUrl: " https://example.test/ ",
    },
    async (body) => {
      calls.push(body);
      return { id };
    },
  );
  assert.deepEqual(calls, [
    {
      kind: "master",
      type: "brewery",
      id: null,
      data: {
        name: "新しい酒造",
        name_kana: "あたらしいしゅぞう",
        prefecture: "長野県",
        website_url: "https://example.test/",
      },
      reason: null,
    },
  ]);
  assert.deepEqual(brewery, {
    id,
    name: "新しい酒造",
    name_kana: "あたらしいしゅぞう",
    prefecture: "長野県",
    website_url: "https://example.test/",
    is_active: true,
  });
});
test("inline registration does not save invalid data and propagates registration failures", async () => {
  let calls = 0;
  const save = async () => {
    calls++;
    return { id };
  };
  const input = { name: "酒造", nameKana: "", prefecture: "", websiteUrl: "" };
  await assert.rejects(
    registerBrewery({ ...input, name: " " }, save),
    /酒蔵名を入力/,
  );
  await assert.rejects(
    registerBrewery({ ...input, websiteUrl: "javascript:alert(1)" }, save),
    /入力内容を確認/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    registerBrewery(input, async () => {
      throw new Error("同じ情報が登録されています");
    }),
    /同じ情報が登録/,
  );
});
