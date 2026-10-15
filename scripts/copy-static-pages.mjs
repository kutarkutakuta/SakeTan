import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";

const source = join(process.cwd(), ".next", "server", "app");
const assets = join(process.cwd(), ".open-next", "assets");

if (!existsSync(assets)) {
  throw new Error("OpenNextの静的アセットが生成されていません");
}

// Detail routes are prerendered from the same public snapshot as sitemap.xml.
// Copy only HTML/RSC, not Next's metadata or segment cache files.
const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), ".generated/public-details.json"), "utf8"),
);
let detailCount = 0;
for (const type of ["shops", "brands", "breweries"]) {
  mkdirSync(join(assets, type), { recursive: true });
  for (const id of Object.keys(snapshot[type])) {
    for (const extension of ["html", "rsc"]) {
      const file = join(source, type, `${id}.${extension}`);
      if (!existsSync(file))
        throw new Error(`${type}/${id}.${extension} が静的生成されていません`);
      copyFileSync(file, join(assets, type, `${id}.${extension}`));
    }
    detailCount += 1;
  }
}

function countFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce(
    (count, entry) =>
      count +
      (entry.isDirectory() ? countFiles(join(directory, entry.name)) : 1),
    0,
  );
}
// These pages read live data in the browser. Serve both their HTML and RSC
// payloads as assets so navigation does not invoke the Worker.
for (const route of [
  "index",
  "detail-shell",
  "account",
  "brands",
  "breweries",
  "shops",
  "edit",
  "help",
  "history",
  "login",
  "post",
  "privacy",
]) {
  for (const extension of ["html", "rsc"]) {
    const name = `${route}.${extension}`;
    const file = join(source, name);
    if (!existsSync(file)) {
      throw new Error(`${name} が静的生成されていません`);
    }
    copyFileSync(file, join(assets, name));
  }
}

const assetCount = countFiles(assets);
// Stay within Workers Free's asset limit; never silently require a paid plan.
if (assetCount > 20000)
  throw new Error(
    `静的アセットが無料枠上限20,000ファイルを超えました: ${assetCount}`,
  );
console.log(
  `詳細 ${detailCount}ページを静的配信します（アセット合計 ${assetCount}ファイル）`,
);
