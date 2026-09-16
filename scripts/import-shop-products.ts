import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import robotsParser from "robots-parser";
import { z } from "zod";
import { adminClient, paged } from "./supabase-admin";
import {
  buildReviewItems,
  extractProducts,
  paginationLinks,
} from "./shop-products/parser";
import type {
  CatalogBrand,
  CrawlManifest,
  CrawledPage,
  ShopProductReview,
} from "./shop-products/types";

const userAgent = "SAKETAN-ShopImporter";
const maximumResponseBytes = 5 * 1024 * 1024;

type Phase = "fetch" | "parse" | "import";
type Options = {
  shopId: string;
  sourceUrl: string;
  phases: Phase[];
  selector?: string;
  maxPages: number;
  delayMs: number;
  force: boolean;
};

const reviewSchema = z.object({
  version: z.literal(1),
  shop: z.object({ id: z.uuid(), name: z.string().min(1) }),
  sourceUrl: z.url(),
  fetchedAt: z.iso.datetime(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  generatedAt: z.iso.datetime(),
  instructions: z.string(),
  items: z.array(
    z.object({
      sourceName: z.string().min(1).max(300),
      sourceUrl: z.url().nullable(),
      pageUrl: z.url(),
      method: z.enum([
        "json-ld",
        "microdata",
        "selector",
        "brand-table",
        "heuristic",
      ]),
      matchKind: z.enum(["exact", "suggested", "ambiguous", "unmatched"]),
      candidates: z.array(
        z.object({
          brandId: z.uuid(),
          brandName: z.string(),
          breweryName: z.string().nullable(),
          score: z.number(),
        }),
      ),
      approved: z.boolean(),
      brandId: z.uuid().nullable(),
    }),
  ),
});

function usage(): never {
  throw new Error(
    [
      "使い方:",
      "  npm run import:shop-products -- --shop-id=<UUID> --url=<商品一覧URL> --fetch",
      "  npm run import:shop-products -- --shop-id=<UUID> --url=<商品一覧URL> --parse [--selector=<CSS>]",
      "  review.json の approved を確認後:",
      "  npm run import:shop-products -- --shop-id=<UUID> --url=<商品一覧URL> --import",
      "  --all は安全のため fetch と parse だけを実行し、importは行いません。",
    ].join("\n"),
  );
}

function argumentValue(argument: string, name: string) {
  return argument.startsWith(name + "=")
    ? argument.slice(name.length + 1)
    : null;
}

function selectedValue(argumentsList: string[], name: string) {
  return argumentsList
    .map((argument) => argumentValue(argument, name))
    .find((value) => value !== null);
}

function integerOption(
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error(min + "〜" + max + "の整数を指定してください: " + value);
  return parsed;
}

function parseOptions(): Options {
  const argumentsList = process.argv.slice(2);
  const shopId = selectedValue(argumentsList, "--shop-id");
  const sourceUrl = selectedValue(argumentsList, "--url");
  if (!shopId || !z.string().uuid().safeParse(shopId).success || !sourceUrl)
    usage();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return usage();
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) usage();
  parsedUrl.hash = "";

  const all = argumentsList.includes("--all");
  const phases: Phase[] = all
    ? ["fetch", "parse"]
    : (["fetch", "parse", "import"] as const).filter((phase) =>
        argumentsList.includes("--" + phase),
      );
  if ((!all && phases.length !== 1) || (all && phases.length !== 2)) usage();

  return {
    shopId,
    sourceUrl: parsedUrl.toString(),
    phases,
    selector: selectedValue(argumentsList, "--selector") ?? undefined,
    maxPages: integerOption(
      selectedValue(argumentsList, "--max-pages"),
      5,
      1,
      50,
    ),
    delayMs: integerOption(
      selectedValue(argumentsList, "--delay-ms"),
      1_000,
      1_000,
      30_000,
    ),
    force: argumentsList.includes("--force"),
  };
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function artifactPaths(options: Options) {
  const root = resolve(
    "data/shop-products",
    options.shopId,
    sha256(options.sourceUrl).slice(0, 12),
  );
  return {
    root,
    raw: resolve(root, "raw"),
    manifest: resolve(root, "manifest.json"),
    parsed: resolve(root, "parsed.json"),
    review: resolve(root, "review.json"),
  };
}

async function atomicWrite(path: string, contents: string | Uint8Array) {
  const temporary = path + "." + process.pid + ".tmp";
  await writeFile(temporary, contents);
  await rename(temporary, path);
}

async function writeJson(path: string, value: unknown) {
  await atomicWrite(path, JSON.stringify(value, null, 2) + "\n");
}

function privateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateIp(address: string) {
  if (isIP(address) === 4) return privateIpv4(address);
  const normalized = address.toLocaleLowerCase("en");
  if (normalized.startsWith("::ffff:"))
    return privateIpv4(normalized.slice("::ffff:".length));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

async function assertPublicUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("HTTP(S)以外のURLは取得できません: " + value);
  if (url.username || url.password)
    throw new Error("認証情報を含むURLは指定できません");
  const hostname = url.hostname.toLocaleLowerCase("en");
  if (hostname === "localhost" || hostname.endsWith(".localhost"))
    throw new Error("ローカルアドレスは取得できません");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address)))
    throw new Error("公開アドレス以外は取得できません: " + hostname);
}

async function readLimited(response: Response, maximumBytes: number) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("応答サイズが上限を超えています: " + total + " bytes");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function fetchBytes(value: string, maximumBytes = maximumResponseBytes) {
  let current = value;
  for (let redirects = 0; redirects <= 5; redirects++) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": userAgent + "/0.1",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location)
        throw new Error("転送先がありません: HTTP " + response.status);
      current = new URL(location, current).toString();
      continue;
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
      throw new Error(
        "応答サイズが上限を超えています: " + declaredLength + " bytes",
      );
    const bytes = await readLimited(response, maximumBytes);
    return { response, bytes, finalUrl: current };
  }
  throw new Error("リダイレクトが多すぎます");
}

function decodeHtml(bytes: Uint8Array, contentType: string) {
  const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function robotsFor(sourceUrl: string) {
  const robotsUrl = new URL("/robots.txt", sourceUrl).toString();
  const { response, bytes } = await fetchBytes(robotsUrl, 512 * 1024);
  if (response.status === 404 || response.status === 410)
    return robotsParser(robotsUrl, "");
  if (!response.ok)
    throw new Error("robots.txtを確認できません: HTTP " + response.status);
  return robotsParser(robotsUrl, new TextDecoder("utf-8").decode(bytes));
}

function sleep(milliseconds: number) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function runFetch(options: Options) {
  const output = artifactPaths(options);
  if (!options.force) {
    try {
      await readFile(output.manifest);
      throw new Error(
        "取得済みです。再取得する場合は --force を付けてください: " +
          output.root,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await rm(output.raw, { recursive: true, force: true });
  await mkdir(output.raw, { recursive: true });
  const robots = await robotsFor(options.sourceUrl);
  const origin = new URL(options.sourceUrl).origin;
  const pending = [options.sourceUrl];
  const seen = new Set<string>();
  const pages: CrawledPage[] = [];

  while (pending.length && pages.length < options.maxPages) {
    const normalized = new URL(pending.shift()!);
    normalized.hash = "";
    const url = normalized.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    if (normalized.origin !== origin)
      throw new Error("別ドメインへのページ送りは追跡しません: " + url);
    if (robots.isAllowed(url, userAgent) === false)
      throw new Error("robots.txtにより取得できません: " + url);
    if (pages.length) await sleep(options.delayMs);
    const { response, bytes, finalUrl } = await fetchBytes(url);
    if (!response.ok)
      throw new Error(
        "ページ取得に失敗しました: HTTP " + response.status + " " + url,
      );
    if (new URL(finalUrl).origin !== origin)
      throw new Error(
        "別ドメインへのリダイレクトは追跡しません。転送後のURLを指定してください: " +
          finalUrl,
      );
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/html|xhtml/i.test(contentType))
      throw new Error("HTMLではない応答です: " + contentType);
    const html = decodeHtml(bytes, contentType);
    const file = String(pages.length + 1).padStart(3, "0") + ".html";
    await atomicWrite(resolve(output.raw, file), html);
    pages.push({
      url: finalUrl,
      file,
      fetchedAt: new Date().toISOString(),
      contentType,
      sha256: sha256(html),
    });
    for (const nextUrl of paginationLinks(html, finalUrl)) {
      if (new URL(nextUrl).origin === origin && !seen.has(nextUrl))
        pending.push(nextUrl);
    }
    console.log(
      "fetch " + pages.length + "/" + options.maxPages + ": " + finalUrl,
    );
  }

  const manifest: CrawlManifest = {
    version: 1,
    sourceUrl: options.sourceUrl,
    generatedAt: new Date().toISOString(),
    pages,
  };
  await writeJson(output.manifest, manifest);
  console.log("取得完了: " + pages.length + "ページ\n" + output.manifest);
}

async function loadShopAndCatalog(shopId: string) {
  const db = adminClient();
  const { data: shop, error: shopError } = await db
    .from("shops")
    .select("id,name")
    .eq("id", shopId)
    .eq("is_active", true)
    .maybeSingle();
  if (shopError) throw new Error(shopError.message);
  if (!shop) throw new Error("有効な対象店舗が見つかりません");

  type BrandRow = {
    id: string;
    name: string;
    name_kana: string | null;
    breweries: { name: string } | Array<{ name: string }> | null;
  };
  const rows = await paged<BrandRow>(
    (from, to) =>
      db
        .from("brands")
        .select("id,name,name_kana,breweries(name)")
        .eq("is_active", true)
        .range(from, to) as unknown as PromiseLike<{
        data: BrandRow[] | null;
        error: { message: string } | null;
      }>,
  );
  const catalog: CatalogBrand[] = rows.map((brand) => {
    const brewery = Array.isArray(brand.breweries)
      ? brand.breweries[0]
      : brand.breweries;
    return {
      id: brand.id,
      name: brand.name,
      nameKana: brand.name_kana,
      breweryName: brewery?.name ?? null,
    };
  });
  return { shop, catalog };
}

async function runParse(options: Options) {
  const input = artifactPaths(options);
  const manifest = JSON.parse(
    await readFile(input.manifest, "utf8"),
  ) as CrawlManifest;
  if (manifest.sourceUrl !== options.sourceUrl)
    throw new Error("manifest.jsonの取得元URLが指定URLと一致しません");
  if (!options.force) {
    try {
      await readFile(input.review);
      throw new Error(
        "review.jsonは既にあります。承認内容を消して再解析する場合だけ --force を付けてください: " +
          input.review,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const products = [];
  for (const page of manifest.pages) {
    const html = await readFile(resolve(input.raw, page.file), "utf8");
    products.push(...extractProducts(html, page.url, options.selector));
  }
  const uniqueProducts = [
    ...new Map(
      products.map((product) => [
        product.sourceName + "\n" + (product.sourceUrl ?? product.pageUrl),
        product,
      ]),
    ).values(),
  ];
  if (!uniqueProducts.length)
    throw new Error(
      "商品候補を抽出できませんでした。商品名のCSSセレクタを --selector で指定してください。",
    );
  const { shop, catalog } = await loadShopAndCatalog(options.shopId);
  const items = buildReviewItems(uniqueProducts, catalog);
  const contentSha256 = sha256(
    manifest.pages.map((page) => page.sha256).join("\n"),
  );
  const review: ShopProductReview = {
    version: 1,
    shop,
    sourceUrl: manifest.sourceUrl,
    fetchedAt: manifest.pages.at(-1)?.fetchedAt ?? manifest.generatedAt,
    contentSha256,
    generatedAt: new Date().toISOString(),
    instructions:
      "登録する項目だけ approved を true にしてください。brandIdは候補を確認し、必要なら正しい既存銘柄UUIDへ変更してください。未登録銘柄は追加せず別途報告してください。",
    items,
  };
  const summary = {
    shop,
    sourceUrl: manifest.sourceUrl,
    pages: manifest.pages.length,
    extracted: items.length,
    exact: items.filter((item) => item.matchKind === "exact").length,
    suggested: items.filter((item) => item.matchKind === "suggested").length,
    ambiguous: items.filter((item) => item.matchKind === "ambiguous").length,
    unmatched: items.filter((item) => item.matchKind === "unmatched").length,
    selector: options.selector ?? null,
  };
  await writeJson(input.parsed, summary);
  await writeJson(input.review, review);
  console.log(
    JSON.stringify(summary, null, 2) + "\n\n確認ファイル: " + input.review,
  );
}

async function runImport(options: Options) {
  const input = artifactPaths(options);
  const review = reviewSchema.parse(
    JSON.parse(await readFile(input.review, "utf8")),
  );
  if (
    review.shop.id !== options.shopId ||
    review.sourceUrl !== options.sourceUrl
  )
    throw new Error("review.jsonの店舗またはURLが指定内容と一致しません");
  const approved = review.items.filter((item) => item.approved);
  if (!approved.length)
    throw new Error(
      "approved: true の項目がありません。review.jsonを確認してください。",
    );
  const missingBrand = approved.find((item) => !item.brandId);
  if (missingBrand)
    throw new Error(
      "承認済み項目にbrandIdがありません: " + missingBrand.sourceName,
    );
  const db = adminClient();
  const { data, error } = await db.rpc("import_shop_products", {
    p_shop_id: review.shop.id,
    p_source_url: review.sourceUrl,
    p_fetched_at: review.fetchedAt,
    p_content_sha256: review.contentSha256,
    p_items: approved.map((item) => ({
      brand_id: item.brandId,
      source_name: item.sourceName,
      source_url: item.sourceUrl ?? item.pageUrl,
    })),
  });
  if (error)
    throw new Error(
      error.message +
        "\n先に npm run db:migrate で最新migrationを適用してください。",
    );
  console.log("一括登録完了:\n" + JSON.stringify(data, null, 2));
}

async function main() {
  const options = parseOptions();
  for (const phase of options.phases) {
    if (phase === "fetch") await runFetch(options);
    else if (phase === "parse") await runParse(options);
    else await runImport(options);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
