import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const source = join(process.cwd(), ".next", "server", "app");
const assets = join(process.cwd(), ".open-next", "assets");

if (!existsSync(assets)) {
  throw new Error("OpenNextの静的アセットが生成されていません");
}

// These pages read live data in the browser. Serve both their HTML and RSC
// payloads as assets so navigation does not invoke the Worker.
for (const route of [
  "index",
  "account",
  "brands",
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
