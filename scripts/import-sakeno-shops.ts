import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { adminClient, paged } from "./supabase-admin";
import {
  fileStem,
  pagePrefectureName,
  prefectures,
  prefectureUrl,
  type Prefecture,
} from "./sakeno/prefectures";
import { parsePrefectureHtml } from "./sakeno/parser";
import type { ImportState, ParseResult, Phase } from "./sakeno/types";

const root = resolve("data/sakeno");
const paths = {
  raw: resolve(root, "raw"),
  parsed: resolve(root, "parsed"),
  reports: resolve(root, "reports"),
  state: resolve(root, "state.json"),
};
const parsedSchema = z.object({
  prefecture: z.object({
    id: z.number().int().min(1).max(47),
    name: z.string().min(1),
    sourceUrl: z.url(),
  }),
  generatedAt: z.string(),
  stats: z.object({
    found: z.number(),
    parsed: z.number(),
    skipped: z.number(),
    errors: z.number(),
  }),
  shops: z.array(
    z.object({
      source: z.literal("sakeno.com"),
      sourceId: z.string().min(1),
      sourceUrl: z.url().nullable(),
      name: z.string().min(1),
      nameKana: z.string().nullable(),
      prefecture: z.string().min(1),
      city: z.string().nullable(),
      address: z.string().min(1),
    }),
  ),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      sourceId: z.string().optional(),
      name: z.string().optional(),
    }),
  ),
});

function blankState(): ImportState {
  return { fetch: {}, parse: {}, import: {} };
}
async function readState() {
  try {
    return {
      ...blankState(),
      ...JSON.parse(await readFile(paths.state, "utf8")),
    } as ImportState;
  } catch {
    return blankState();
  }
}
async function atomicWrite(path: string, contents: string) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, path);
}
async function writeJson(path: string, value: unknown) {
  await atomicWrite(path, JSON.stringify(value, null, 2) + "\n");
}
async function updateState(
  state: ImportState,
  phase: Phase,
  prefecture: Prefecture,
  status: "success" | "failed",
  message?: string,
) {
  state[phase][String(prefecture.id)] = {
    status,
    updatedAt: new Date().toISOString(),
    ...(message ? { message } : {}),
  };
  await writeJson(paths.state, state);
}
function artifact(phase: "fetch" | "parse", prefecture: Prefecture) {
  return resolve(
    paths[phase === "fetch" ? "raw" : "parsed"],
    `${fileStem(prefecture)}.${phase === "fetch" ? "html" : "json"}`,
  );
}
function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function reconcileRawFilenames() {
  const files = await readdir(paths.raw);
  for (const prefecture of prefectures) {
    const expected = `${fileStem(prefecture)}.html`;
    if (files.includes(expected)) continue;
    const prefix = `${String(prefecture.id).padStart(2, "0")}-`;
    const legacy = files.filter(
      (file) => file.startsWith(prefix) && file.endsWith(".html"),
    );
    if (legacy.length === 1) {
      await rename(resolve(paths.raw, legacy[0]), resolve(paths.raw, expected));
      console.log(`${legacy[0]} → ${expected}`);
    }
  }
}

function validatePageIdentity(html: string, prefecture: Prefecture) {
  if (!html.includes("日本酒が買える店"))
    throw new Error("想定したページ内容ではありません");
  const title = html.match(/<title>([^<]+)の日本酒が買える店/i)?.[1];
  const expectedTitle = pagePrefectureName(prefecture);
  if (title !== expectedTitle)
    throw new Error(
      `URLの都道府県が不一致です: expected=${expectedTitle} actual=${title ?? "unknown"}`,
    );
}

async function fetchHtml(prefecture: Prefecture) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(prefectureUrl(prefecture.id), {
        headers: {
          "User-Agent":
            "SAKETAN/0.1 (one-time shop directory import; contact via application owner)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      validatePageIdentity(html, prefecture);
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 2_000);
    }
  }
  throw lastError;
}

async function runFetch(
  selected: Prefecture[],
  state: ImportState,
  force: boolean,
  delayMs: number,
) {
  let failures = 0;
  let networkRequests = 0;
  for (const prefecture of selected) {
    const output = artifact("fetch", prefecture);
    if (
      !force &&
      state.fetch[String(prefecture.id)]?.status === "success" &&
      existsSync(output)
    ) {
      console.log(`${prefecture.name} fetch: success済みのためskip`);
      continue;
    }
    try {
      if (networkRequests++) await sleep(delayMs);
      const html = await fetchHtml(prefecture);
      await atomicWrite(output, html);
      await updateState(state, "fetch", prefecture, "success");
      console.log(`${prefecture.name} fetch: ${Buffer.byteLength(html)} bytes`);
    } catch (error) {
      failures++;
      const message = error instanceof Error ? error.message : "取得失敗";
      await updateState(state, "fetch", prefecture, "failed", message);
      console.warn(`${prefecture.name} fetch failed: ${message}`);
    }
  }
  if (failures)
    throw new Error(
      `HTML取得に${failures}県失敗しました。再実行すると成功済みをskipします。`,
    );
}

async function runParse(
  selected: Prefecture[],
  state: ImportState,
  force: boolean,
) {
  let failures = 0;
  for (const prefecture of selected) {
    const input = artifact("fetch", prefecture);
    const output = artifact("parse", prefecture);
    const report = resolve(paths.reports, `${fileStem(prefecture)}.json`);
    if (
      !force &&
      state.parse[String(prefecture.id)]?.status === "success" &&
      existsSync(output)
    ) {
      console.log(`${prefecture.name} parse: success済みのためskip`);
      continue;
    }
    try {
      if (!existsSync(input))
        throw new Error(
          "raw HTMLがありません。先に --fetch を実行してください",
        );
      const html = await readFile(input, "utf8");
      validatePageIdentity(html, prefecture);
      const parsed = parsePrefectureHtml(html, prefecture);
      await writeJson(output, parsed);
      await writeJson(report, {
        prefecture: parsed.prefecture,
        generatedAt: parsed.generatedAt,
        stats: parsed.stats,
        warnings: parsed.warnings,
      });
      await updateState(state, "parse", prefecture, "success");
      console.log(
        `${prefecture.name} found:${parsed.stats.found} parsed:${parsed.stats.parsed} skipped:${parsed.stats.skipped} errors:${parsed.stats.errors} warnings:${parsed.warnings.length}`,
      );
    } catch (error) {
      failures++;
      const message = error instanceof Error ? error.message : "解析失敗";
      await updateState(state, "parse", prefecture, "failed", message);
      console.warn(`${prefecture.name} parse failed: ${message}`);
    }
  }
  if (failures)
    throw new Error(
      `HTML解析に${failures}県失敗しました。レポートとraw HTMLを確認してください。`,
    );
  const results = await Promise.all(
    selected.map(async (prefecture) =>
      parsedSchema.parse(
        JSON.parse(await readFile(artifact("parse", prefecture), "utf8")),
      ),
    ),
  );
  await writeJson(resolve(paths.reports, "summary.json"), {
    generatedAt: new Date().toISOString(),
    prefectures: results.map((result) => ({
      ...result.prefecture,
      ...result.stats,
      warnings: result.warnings.length,
    })),
    totals: results.reduce(
      (totals, result) => ({
        found: totals.found + result.stats.found,
        parsed: totals.parsed + result.stats.parsed,
        skipped: totals.skipped + result.stats.skipped,
        errors: totals.errors + result.stats.errors,
        warnings: totals.warnings + result.warnings.length,
      }),
      { found: 0, parsed: 0, skipped: 0, errors: 0, warnings: 0 },
    ),
  });
}

type ExistingShop = {
  id: string;
  source: string | null;
  source_id: string | null;
};
async function runImport(
  selected: Prefecture[],
  state: ImportState,
  force: boolean,
) {
  const db = adminClient();
  const existing = await paged<ExistingShop>((from, to) =>
    db.from("shops").select("id,source,source_id").order("id").range(from, to),
  );
  const bySource = new Map(
    existing
      .filter((shop) => shop.source && shop.source_id)
      .map((shop) => [`${shop.source}|${shop.source_id}`, shop]),
  );
  let failures = 0;
  for (const prefecture of selected) {
    if (!force && state.import[String(prefecture.id)]?.status === "success") {
      console.log(`${prefecture.name} import: success済みのためskip`);
      continue;
    }
    try {
      const parsed = parsedSchema.parse(
        JSON.parse(await readFile(artifact("parse", prefecture), "utf8")),
      ) as ParseResult;
      let inserted = 0,
        merged = 0,
        existingCount = 0,
        warnings = 0;
      const pending: Record<string, unknown>[] = [];
      for (const shop of parsed.shops) {
        const sourceKey = `${shop.source}|${shop.sourceId}`;
        if (bySource.has(sourceKey)) {
          existingCount++;
          continue;
        }
        const row = {
          name: shop.name,
          name_kana: shop.nameKana,
          prefecture: shop.prefecture,
          city: shop.city,
          latitude: null,
          longitude: null,
          source: shop.source,
          source_id: shop.sourceId,
          source_url: shop.sourceUrl,
          created_by: null,
          is_active: true,
        };
        pending.push(row);
        bySource.set(sourceKey, row as unknown as ExistingShop);
      }
      for (let index = 0; index < pending.length; index += 200) {
        const batch = pending.slice(index, index + 200);
        const { error } = await db.from("shops").upsert(batch, {
          onConflict: "source,source_id",
          ignoreDuplicates: true,
        });
        if (error) throw new Error(error.message);
        inserted += batch.length;
      }
      const reportPath = resolve(paths.reports, `${fileStem(prefecture)}.json`);
      let report: Record<string, unknown> = {};
      try {
        report = JSON.parse(await readFile(reportPath, "utf8"));
      } catch {
        /* report is optional */
      }
      await writeJson(reportPath, {
        ...report,
        importedAt: new Date().toISOString(),
        import: { inserted, merged, existing: existingCount, warnings },
      });
      await updateState(state, "import", prefecture, "success");
      console.log(
        `${prefecture.name} import inserted:${inserted} merged:${merged} existing:${existingCount} warnings:${warnings}`,
      );
    } catch (error) {
      failures++;
      const message = error instanceof Error ? error.message : "DB投入失敗";
      await updateState(state, "import", prefecture, "failed", message);
      console.warn(`${prefecture.name} import failed: ${message}`);
    }
  }
  if (failures)
    throw new Error(
      `DB投入に${failures}県失敗しました。再実行すると成功済みをskipします。`,
    );
}

async function main() {
  const modes = (["fetch", "parse", "import", "all"] as const).filter((mode) =>
    process.argv.includes(`--${mode}`),
  );
  if (modes.length !== 1)
    throw new Error(
      "--fetch / --parse / --import / --all のいずれか1つを指定してください。",
    );
  const prefectureArg = process.argv.find((arg) =>
    arg.startsWith("--prefecture="),
  );
  const id = prefectureArg ? Number(prefectureArg.split("=")[1]) : null;
  if (id !== null && (!Number.isInteger(id) || id < 1 || id > 47))
    throw new Error("--prefecture は1〜47で指定してください。");
  const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
  const delayMs = Math.max(1_000, Number(delayArg?.split("=")[1]) || 1_000);
  const selected = id
    ? prefectures.filter((item) => item.id === id)
    : prefectures;
  const force = process.argv.includes("--force");
  await Promise.all([
    mkdir(paths.raw, { recursive: true }),
    mkdir(paths.parsed, { recursive: true }),
    mkdir(paths.reports, { recursive: true }),
  ]);
  await reconcileRawFilenames();
  const state = await readState();
  if (modes[0] === "fetch" || modes[0] === "all")
    await runFetch(selected, state, force, delayMs);
  if (modes[0] === "parse" || modes[0] === "all")
    await runParse(selected, state, force);
  if (modes[0] === "import" || modes[0] === "all")
    await runImport(selected, state, force);
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "酒屋データ処理に失敗しました",
  );
  process.exitCode = 1;
});
