import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const source = join(process.cwd(), ".next", "server", "app");
const assets = join(process.cwd(), ".open-next", "assets");

if (!existsSync(assets)) {
  throw new Error("OpenNextの静的アセットが生成されていません");
}

// /post reads shop_id only in the browser. Keep both the document and the
// Next.js RSC data route on the static-assets path, from the same build.
for (const name of ["post.html", "post.rsc"]) {
  const file = join(source, name);
  if (!existsSync(file)) {
    throw new Error(`${name} が静的生成されていません`);
  }
  copyFileSync(file, join(assets, name));
}
