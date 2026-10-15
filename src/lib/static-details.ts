import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PublicDetailSnapshot } from "./public-detail";

let snapshot: PublicDetailSnapshot | undefined;

// This file is prepared once before next build; rendering pages never queries DB.
export function staticDetails() {
  snapshot ??= JSON.parse(
    readFileSync(join(process.cwd(), ".generated/public-details.json"), "utf8"),
  ) as PublicDetailSnapshot;
  return snapshot;
}
