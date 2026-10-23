import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "cheerio";

const root = process.cwd();
const snapshot = JSON.parse(
  readFileSync(join(root, ".generated/public-details.json"), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(join(root, ".next/prerender-manifest.json"), "utf8"),
);
const sitemap = load(readFileSync(join(root, "public/sitemap.xml"), "utf8"), {
  xml: true,
});
const sitemapUrls = new Set(
  sitemap("loc")
    .map((_, element) => sitemap(element).text())
    .get(),
);
let count = 0;
for (const type of ["shops", "brands", "breweries"]) {
  for (const [id, data] of Object.entries(snapshot[type])) {
    const path = `/${type}/${id}`;
    const url = `https://xn--l8jsqp0k5g.jp${path}`;
    const $ = load(
      readFileSync(
        join(root, ".open-next/assets", `${path.slice(1)}.html`),
        "utf8",
      ),
    );
    const name = type === "shops" ? data.shop.name : data.initial.name;
    assert.equal($("head link[rel=canonical]").length, 1, path);
    assert.equal($("head link[rel=canonical]").attr("href"), url, path);
    assert.equal($("meta[property='og:url']").attr("content"), url, path);
    assert.ok($("title").text().includes(name), `title: ${path}`);
    assert.ok(
      $("meta[name=description]").attr("content").includes(name),
      `description: ${path}`,
    );
    assert.ok($("main h1").text().includes(name), `initial HTML body: ${path}`);
    assert.ok(
      !$("meta[name=robots]").attr("content")?.includes("noindex"),
      `indexable: ${path}`,
    );
    assert.ok(sitemapUrls.has(url), `sitemap: ${path}`);
    assert.equal(
      manifest.routes[path]?.initialRevalidateSeconds,
      false,
      `no ISR: ${path}`,
    );
    if (type === "shops") {
      for (const relation of data.relations) {
        assert.ok(
          $(`main a[href^='/brands/${relation.brand_id}']`).length,
          `brand link: ${path}`,
        );
      }
    }
    count += 1;
  }
  assert.equal(
    manifest.dynamicRoutes[`/${type}/[id]`]?.fallback,
    false,
    `no runtime generation: ${type}`,
  );
}
for (const [file, path] of [
  ["index", "/"],
  ["shops", "/shops"],
  ["brands", "/brands"],
  ["breweries", "/breweries"],
]) {
  const $ = load(
    readFileSync(join(root, ".open-next/assets", `${file}.html`), "utf8"),
  );
  assert.equal(new URL($("link[rel=canonical]").attr("href")).pathname, path);
  const icon = $("head link[rel=icon]");
  assert.equal(icon.length, 1, `favicon: ${path}`);
  const iconUrl = new URL(icon.attr("href"), "https://xn--l8jsqp0k5g.jp");
  assert.equal(iconUrl.pathname, "/icon.png", `favicon URL: ${path}`);
  assert.equal(icon.attr("type"), "image/png", `favicon type: ${path}`);
  assert.deepEqual(
    readFileSync(join(root, ".open-next/assets", iconUrl.pathname.slice(1))),
    readFileSync(join(root, ".next/server/app/icon.png.body")),
    `favicon asset: ${path}`,
  );
}
const shell = load(
  readFileSync(join(root, ".open-next/assets/detail-shell.html"), "utf8"),
);
assert.equal(
  shell("link[rel=canonical]").length,
  0,
  "fallback must not canonicalize to home",
);
const config = readFileSync(join(root, "wrangler.jsonc"), "utf8");
assert.match(
  config,
  /"run_worker_first"\s*:\s*false/,
  "serve generated assets without Worker invocations",
);
console.log(
  `SEO検証成功: 詳細 ${count}ページのcanonical・個別メタデータ・初期本文・サイトマップ・再生成無効を確認`,
);
