import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import {
  fileStem,
  pagePrefectureName,
  prefectures,
  prefectureUrl,
} from "../scripts/sakeno/prefectures";
import {
  findShopBlocks,
  normalizeAddress,
  normalizeShopName,
  parseAddress,
  parseCity,
  parsePrefectureHtml,
  parseShopKana,
  parseWebsiteUrl,
} from "../scripts/sakeno/parser";

const tokyo = prefectures[12];

test("prefecture URL and filenames cover all 47 prefectures", () => {
  assert.equal(prefectures.length, 47);
  assert.deepEqual(
    prefectures.map((item) => item.id),
    Array.from({ length: 47 }, (_, index) => index + 1),
  );
  assert.equal(prefectureUrl(13), "https://www.sakeno.com/sakaya_todou/13/");
  assert.equal(fileStem(tokyo), "13-tokyo");
  assert.equal(prefectures[3].name, "秋田県");
  assert.equal(prefectures[4].name, "宮城県");
  assert.equal(prefectures[7].name, "栃木県");
  assert.equal(prefectures[9].name, "茨城県");
  assert.equal(pagePrefectureName(tokyo), "東京");
});

test("current table markup parses semantic shop fields", () => {
  const html = `<table class="hyoji"><tr><th>東京の日本酒が買える店</th></tr><tr><td><strong class="lrg"><a href="https://www.sakeno.com/sakaya/7/">はせがわ酒店</a></strong><div class="smls">はせがわさけてん</div><div class="smll">〒100-0005<br>東京都千代田区丸の内1-1-1<br>TEL 03-0000-0000<br><a href="https://example.com/shop">公式</a></div></td></tr></table>`;
  const parsed = parsePrefectureHtml(html, tokyo);
  assert.deepEqual(parsed.stats, {
    found: 1,
    parsed: 1,
    skipped: 0,
    errors: 0,
  });
  assert.deepEqual(parsed.shops[0], {
    source: "sakeno.com",
    sourceId: "7",
    sourceUrl: "https://www.sakeno.com/sakaya/7/",
    name: "はせがわ酒店",
    nameKana: "はせがわさけてん",
    prefecture: "東京都",
    city: "千代田区",
    address: "東京都千代田区丸の内1-1-1",
    websiteUrl: "https://example.com/shop",
  });
});

test("label and heading fallbacks parse table and definition-list variations", () => {
  const html = `<article><h3><a href="/sakaya/88/">試験酒店</a></h3><dl><dt>読み</dt><dd>しけんさけてん</dd><dt>所在地</dt><dd>東京都横浜市ではない区1-2</dd><dt>Web</dt><dd>https://example.jp/</dd></dl></article>`;
  const $ = load(html);
  const block = findShopBlocks($)[0];
  assert.equal(parseShopKana($, block), "しけんさけてん");
  assert.equal(parseAddress($, block, tokyo), "東京都横浜市ではない区1-2");
  assert.equal(parseWebsiteUrl($, block), "https://example.jp/");
});

test("normalization is comparison-only and city extraction covers designated cities and counties", () => {
  assert.equal(normalizeShopName(" 酒舗　七蔵 "), "酒舗七蔵");
  assert.equal(
    normalizeAddress("東京都 千代田区　丸の内"),
    "東京都千代田区丸の内",
  );
  assert.equal(
    parseCity("神奈川県横浜市中区山下町1", prefectures[13]),
    "横浜市中区",
  );
  assert.equal(
    parseCity("北海道日高郡新ひだか町静内1", prefectures[0]),
    "日高郡新ひだか町",
  );
});

test("exact duplicates merge, similar duplicates warn, and prefecture mismatch skips", () => {
  const html = `<table class="hyoji"><tr><td><strong class="lrg"><a href="/sakaya/1/">同じ酒店</a></strong><div class="smll">東京都港区新橋1</div></td></tr><tr><td><strong class="lrg"><a href="/sakaya/1/">同じ酒店</a></strong><div class="smll">東京都港区新橋1</div></td></tr><tr><td><strong class="lrg"><a href="/sakaya/2/">同じ酒店</a></strong><div class="smll">東京都中央区銀座1</div></td></tr><tr><td><strong class="lrg"><a href="/sakaya/3/">県外酒店</a></strong><div class="smll">神奈川県横浜市中区1</div></td></tr></table>`;
  const parsed = parsePrefectureHtml(html, tokyo);
  assert.equal(parsed.stats.found, 4);
  assert.equal(parsed.stats.parsed, 2);
  assert.equal(parsed.stats.skipped, 2);
  assert.ok(
    parsed.warnings.some((warning) => warning.code === "exact_duplicate"),
  );
  assert.ok(
    parsed.warnings.some((warning) => warning.code === "similar_duplicate"),
  );
  assert.ok(
    parsed.warnings.some((warning) => warning.code === "prefecture_mismatch"),
  );
});

test("candidate blocks with zero valid shops fail loudly", () => {
  assert.throws(
    () =>
      parsePrefectureHtml(
        `<table class="hyoji"><tr><td><a href="/sakaya/9/">住所なし</a></td></tr></table>`,
        tokyo,
      ),
    /解析成功が0件/,
  );
});

test("an explicitly empty prefecture is a valid zero-shop result", () => {
  const parsed = parsePrefectureHtml(
    `<div id="maincontent"><table class="hyoji"><tr><td>現在のところ、沖縄の日本酒が買える店は登録されていません。</td></tr></table></div>`,
    prefectures[46],
  );
  assert.equal(parsed.stats.found, 0);
  assert.equal(parsed.stats.parsed, 0);
  assert.equal(parsed.warnings[0].code, "declared_empty");
});
