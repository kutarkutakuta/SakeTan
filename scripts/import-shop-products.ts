import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
import robotsParser from "robots-parser";
import { z } from "zod";
import { adminClient, paged } from "./supabase-admin";
import {
  autoApproveReviewItems,
  buildReviewItems,
  canonicalizeCatalogPrefixProducts,
  extractPdfTextProducts,
  extractProducts,
  normalizeProductName,
  paginationLinks,
  uniqueApprovedReviewItems,
} from "./shop-products/parser";
import { extractPdfPages } from "./shop-products/pdf";
import {
  profileAllowsName,
  sourceProfileFor,
  type SourceProfile,
} from "./shop-products/profiles";
import type {
  CatalogBrand,
  CrawlManifest,
  CrawledPage,
  ExtractedProduct,
  ShopProductReview,
  StandardExtraction,
} from "./shop-products/types";

const userAgent = "SAKETAN-ShopImporter";
const maximumResponseBytes = 25 * 1024 * 1024;

type Phase = "fetch" | "parse" | "import";
type Options = {
  shopId: string;
  sourceUrl: string;
  phases: Phase[];
  selector?: string;
  maxPages: number;
  delayMs: number;
  force: boolean;
  auto: boolean;
  dryRun: boolean;
  extracted?: string;
  profile: SourceProfile | null;
};

const reviewSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  shop: z.object({ id: z.uuid(), name: z.string().min(1) }),
  sourceUrl: z.url(),
  fetchedAt: z.iso.datetime(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  generatedAt: z.iso.datetime(),
  instructions: z.string(),
  items: z.array(
    z.object({
      sourceName: z.string().min(1).max(300),
      sourceBreweryName: z.string().nullable().optional().default(null),
      sourceUrl: z.url().nullable(),
      pageUrl: z.url(),
      pageNumber: z
        .number()
        .int()
        .positive()
        .nullable()
        .optional()
        .default(null),
      evidence: z.string().nullable().optional().default(null),
      method: z.enum([
        "json-ld",
        "microdata",
        "selector",
        "brand-table",
        "category",
        "pdf-text",
        "ai",
        "heuristic",
      ]),
      matchKind: z.enum([
        "exact",
        "alias",
        "suggested",
        "ambiguous",
        "unmatched",
      ]),
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

const standardExtractionSchema = z.object({
  version: z.literal(1),
  sourceUrl: z.url(),
  generatedAt: z.iso.datetime(),
  items: z.array(
    z.object({
      sourceName: z.string().min(1).max(300),
      sourceBreweryName: z.string().min(1).max(200).nullable(),
      sourceUrl: z.url().nullable(),
      pageUrl: z.url(),
      pageNumber: z.number().int().positive().nullable(),
      evidence: z.string().max(1000).nullable(),
      method: z.enum([
        "json-ld",
        "microdata",
        "selector",
        "brand-table",
        "category",
        "pdf-text",
        "ai",
        "heuristic",
      ]),
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
      "  確実な一致だけ自動登録し、例外をレポート:",
      "  npm run import:shop-products -- --shop-id=<UUID> --url=<一覧URLまたはPDF> --auto",
      "  登録せず結果だけ確認する場合は --auto --dry-run を使います。",
      "  AI等で作成した共通形式を使う場合は --extracted=<JSON> を追加します。",
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
  const profile = sourceProfileFor(parsedUrl.toString());

  const all = argumentsList.includes("--all");
  const auto = argumentsList.includes("--auto");
  const dryRun = argumentsList.includes("--dry-run");
  const extracted = selectedValue(argumentsList, "--extracted") ?? undefined;
  const phases: Phase[] = auto
    ? extracted
      ? dryRun
        ? ["parse"]
        : ["parse", "import"]
      : dryRun
        ? ["fetch", "parse"]
        : ["fetch", "parse", "import"]
    : all
      ? ["fetch", "parse"]
      : (["fetch", "parse", "import"] as const).filter((phase) =>
          argumentsList.includes("--" + phase),
        );
  if (
    (!auto && !all && phases.length !== 1) ||
    (!auto && all && phases.length !== 2)
  )
    usage();

  return {
    shopId,
    sourceUrl: parsedUrl.toString(),
    phases,
    selector:
      selectedValue(argumentsList, "--selector") ??
      profile?.selector ??
      undefined,
    maxPages: integerOption(
      selectedValue(argumentsList, "--max-pages"),
      profile?.maxPages ?? (auto ? 50 : 5),
      1,
      200,
    ),
    delayMs: integerOption(
      selectedValue(argumentsList, "--delay-ms"),
      1_000,
      1_000,
      30_000,
    ),
    force: argumentsList.includes("--force") || auto,
    auto,
    dryRun,
    extracted,
    profile,
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
    extracted: resolve(root, "extracted.json"),
    review: resolve(root, "review.json"),
    reportJson: resolve(root, "report.json"),
    reportMarkdown: resolve(root, "report.md"),
    pdfText: resolve(root, "pdf-text.json"),
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
        Accept:
          "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.8",
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
  const headerCharset = contentType.match(
    /charset\s*=\s*["']?([^;"'\s]+)/i,
  )?.[1];
  const beginning = new TextDecoder("windows-1252").decode(
    bytes.slice(0, 4096),
  );
  const metaCharset =
    beginning.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'>;]+)/i)?.[1] ??
    beginning.match(
      /<meta[^>]+content=["'][^"']*charset\s*=\s*([^\s"'>;]+)/i,
    )?.[1];
  const charset = headerCharset ?? metaCharset;
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
    let fetched: Awaited<ReturnType<typeof fetchBytes>> | null = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      fetched = await fetchBytes(url);
      if (
        fetched.response.ok ||
        !(
          fetched.response.status === 429 ||
          fetched.response.status >= 500
        ) ||
        attempt === 4
      )
        break;
      console.warn(
        `一時エラー HTTP ${fetched.response.status}。再試行 ${attempt}/3: ${url}`,
      );
      await sleep(options.delayMs * attempt);
    }
    const { response, bytes, finalUrl } = fetched!;
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
    const pdf =
      /application\/pdf/i.test(contentType) ||
      /\.pdf(?:$|[?#])/i.test(finalUrl);
    if (contentType && !pdf && !/html|xhtml/i.test(contentType))
      throw new Error("HTMLまたはPDFではない応答です: " + contentType);
    if (pdf) {
      if (pages.length)
        throw new Error("HTMLのページ送り先にPDFが含まれています: " + finalUrl);
      const file = "001.pdf";
      await atomicWrite(resolve(output.raw, file), bytes);
      pages.push({
        url: finalUrl,
        file,
        fetchedAt: new Date().toISOString(),
        contentType: contentType || "application/pdf",
        sha256: sha256(bytes),
      });
      console.log("fetch PDF: " + finalUrl);
      break;
    }
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
    truncated: pending.length > 0,
  };
  await writeJson(output.manifest, manifest);
  console.log(
    "取得完了: " +
      pages.length +
      "ページ" +
      (manifest.truncated ? "（上限到達。続きがあります）" : "") +
      "\n" +
      output.manifest,
  );
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

function extractionKey(product: ExtractedProduct) {
  return `${normalizeProductName(product.sourceName)}\n${normalizeProductName(product.sourceBreweryName ?? "")}`;
}

function uniqueExtractions(products: ExtractedProduct[]) {
  return [
    ...new Map(
      products.map((product) => [extractionKey(product), product]),
    ).values(),
  ];
}

function markdownCell(value: string | null | undefined) {
  return (value || "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function writeReport(
  options: Options,
  summary: Record<string, unknown>,
  review: ShopProductReview,
  importResult?: unknown,
) {
  const output = artifactPaths(options);
  const highConfidence = review.items.filter((item) =>
    ["exact", "alias"].includes(item.matchKind),
  );
  const approvedBrandIds = new Set(
    review.items
      .filter((item) => item.approved && item.brandId)
      .map((item) => item.brandId),
  );
  const duplicateMatches = highConfidence.filter(
    (item) =>
      item.brandId && !item.approved && approvedBrandIds.has(item.brandId),
  );
  const needsReview = review.items.filter(
    (item) =>
      !item.approved &&
      !(
        item.brandId &&
        ["exact", "alias"].includes(item.matchKind) &&
        duplicateMatches.includes(item)
      ),
  );
  const report = {
    ...summary,
    importResult: importResult ?? null,
    duplicateMatches: duplicateMatches.map((item) => ({
      sourceName: item.sourceName,
      sourceBreweryName: item.sourceBreweryName,
      brandId: item.brandId,
    })),
    needsReview: needsReview.map((item) => ({
      sourceName: item.sourceName,
      sourceBreweryName: item.sourceBreweryName,
      pageUrl: item.pageUrl,
      pageNumber: item.pageNumber,
      reason: item.matchKind,
      candidates: item.candidates,
    })),
  };
  await writeJson(output.reportJson, report);

  const lines = [
    `# ${review.shop.name} 銘柄取込レポート`,
    "",
    `- 取得元: ${review.sourceUrl}`,
    `- 生成日時: ${review.generatedAt}`,
    `- 抽出件数: ${String(summary.extracted ?? 0)}`,
    `- 抽出時の重複: ${String(summary.sourceDuplicates ?? 0)}`,
    `- 自動登録対象: ${String(summary.autoApproved ?? 0)}`,
    `- 同一銘柄への集約: ${String(summary.consolidatedDuplicates ?? 0)}`,
    `- 要確認: ${needsReview.length}`,
  ];
  if (importResult) {
    lines.push("", "## 登録結果", "", "```json");
    lines.push(JSON.stringify(importResult, null, 2), "```");
  }
  lines.push("", "## 登録できなかった銘柄", "");
  if (!needsReview.length) lines.push("なし");
  else {
    lines.push("| 銘柄 | 蔵名 | 理由 | 候補 | 出典 |", "|---|---|---|---|---|");
    for (const item of needsReview) {
      const candidates = item.candidates
        .map(
          (candidate) =>
            `${candidate.brandName}${candidate.breweryName ? ` (${candidate.breweryName})` : ""}`,
        )
        .join(", ");
      const location = item.pageNumber
        ? `${item.pageUrl} PDF ${item.pageNumber}ページ`
        : item.pageUrl;
      lines.push(
        `| ${markdownCell(item.sourceName)} | ${markdownCell(item.sourceBreweryName)} | ${item.matchKind} | ${markdownCell(candidates)} | ${markdownCell(location)} |`,
      );
    }
  }
  await atomicWrite(output.reportMarkdown, lines.join("\n") + "\n");
}

async function runParse(options: Options) {
  const input = artifactPaths(options);
  await mkdir(input.root, { recursive: true });
  let externalExtraction: z.infer<typeof standardExtractionSchema> | null =
    null;
  let manifest: CrawlManifest;
  if (options.extracted) {
    const extractionText = await readFile(resolve(options.extracted), "utf8");
    externalExtraction = standardExtractionSchema.parse(
      JSON.parse(extractionText),
    );
    if (externalExtraction.sourceUrl !== options.sourceUrl)
      throw new Error("共通抽出JSONのsourceUrlが指定URLと一致しません");
    const now = new Date().toISOString();
    manifest = {
      version: 1,
      sourceUrl: options.sourceUrl,
      generatedAt: now,
      pages: [
        {
          url: options.sourceUrl,
          file: "external-extraction.json",
          fetchedAt: now,
          contentType: "application/json",
          sha256: sha256(extractionText),
        },
      ],
    };
    await writeJson(input.manifest, manifest);
  } else {
    manifest = JSON.parse(
      await readFile(input.manifest, "utf8"),
    ) as CrawlManifest;
  }
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
  let products: ExtractedProduct[] = [];
  if (externalExtraction) {
    products = externalExtraction.items;
  } else {
    for (const page of manifest.pages) {
      if (/pdf/i.test(page.contentType) || page.file.endsWith(".pdf")) {
        const bytes = new Uint8Array(
          await readFile(resolve(input.raw, page.file)),
        );
        const pdfPages = await extractPdfPages(bytes);
        await writeJson(input.pdfText, pdfPages);
        products.push(...extractPdfTextProducts(pdfPages, page.url));
      } else {
        const html = await readFile(resolve(input.raw, page.file), "utf8");
        products.push(
          ...extractProducts(html, page.url, options.selector, options.profile),
        );
      }
    }
  }
  const uniqueProducts = uniqueExtractions(products);
  const filteredProducts = uniqueProducts.filter((product) =>
    profileAllowsName(options.profile, product.sourceName),
  );
  if (!filteredProducts.length)
    throw new Error(
      "商品候補を抽出できませんでした。商品名のCSSセレクタを --selector で指定してください。",
    );
  const { shop, catalog } = await loadShopAndCatalog(options.shopId);
  const productsForMatching = options.profile?.canonicalizeBrandPrefix
    ? canonicalizeCatalogPrefixProducts(filteredProducts, catalog)
    : filteredProducts;
  const matchedItems = buildReviewItems(productsForMatching, catalog);
  const items = options.auto
    ? autoApproveReviewItems(matchedItems)
    : matchedItems;
  const contentSha256 = sha256(
    manifest.pages.map((page) => page.sha256).join("\n"),
  );
  const review: ShopProductReview = {
    version: 2,
    shop,
    sourceUrl: manifest.sourceUrl,
    fetchedAt: manifest.pages.at(-1)?.fetchedAt ?? manifest.generatedAt,
    contentSha256,
    generatedAt: new Date().toISOString(),
    instructions: options.auto
      ? "完全一致または確認済み表記揺れだけを自動承認済みです。suggested、ambiguous、unmatchedは登録せずreport.mdへ出力しています。"
      : "登録する項目だけ approved を true にしてください。brandIdは候補を確認し、必要なら正しい既存銘柄UUIDへ変更してください。未登録銘柄は追加せず別途報告してください。",
    items,
  };
  const extraction: StandardExtraction = {
    version: 1,
    sourceUrl: manifest.sourceUrl,
    generatedAt: new Date().toISOString(),
    items: filteredProducts,
  };
  const highConfidenceCount = items.filter((item) =>
    ["exact", "alias"].includes(item.matchKind),
  ).length;
  const summary = {
    shop,
    sourceUrl: manifest.sourceUrl,
    pages: manifest.pages.length,
    pageLimitReached: Boolean(manifest.truncated),
    extractedBeforeDeduplication: products.length,
    extracted: items.length,
    sourceDuplicates: products.length - uniqueProducts.length,
    profileExcluded: uniqueProducts.length - filteredProducts.length,
    exact: items.filter((item) => item.matchKind === "exact").length,
    alias: items.filter((item) => item.matchKind === "alias").length,
    suggested: items.filter((item) => item.matchKind === "suggested").length,
    ambiguous: items.filter((item) => item.matchKind === "ambiguous").length,
    unmatched: items.filter((item) => item.matchKind === "unmatched").length,
    autoApproved: items.filter((item) => item.approved).length,
    consolidatedDuplicates: options.auto
      ? highConfidenceCount - items.filter((item) => item.approved).length
      : 0,
    selector: options.selector ?? null,
    externalExtraction: options.extracted ?? null,
    sourceProfile: options.profile?.name ?? null,
  };
  await writeJson(input.extracted, extraction);
  await writeJson(input.parsed, summary);
  await writeJson(input.review, review);
  await writeReport(options, summary, review);
  console.log(
    JSON.stringify(summary, null, 2) + "\n\n確認ファイル: " + input.review,
  );
}

async function runImport(options: Options) {
  const input = artifactPaths(options);
  const parsedReview = reviewSchema.parse(
    JSON.parse(await readFile(input.review, "utf8")),
  );
  const review: ShopProductReview = { ...parsedReview, version: 2 };
  if (
    review.shop.id !== options.shopId ||
    review.sourceUrl !== options.sourceUrl
  )
    throw new Error("review.jsonの店舗またはURLが指定内容と一致しません");
  const uniqueApproved = uniqueApprovedReviewItems(review.items);
  if (!uniqueApproved.length) {
    if (options.auto) {
      console.log(
        "自動登録できる確実な一致はありませんでした。要確認項目をreport.mdに出力しました。",
      );
      return null;
    }
    throw new Error(
      "approved: true の項目がありません。review.jsonを確認してください。",
    );
  }
  const missingBrand = uniqueApproved.find((item) => !item.brandId);
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
    p_items: uniqueApproved.map((item) => ({
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
  const summary = JSON.parse(await readFile(input.parsed, "utf8")) as Record<
    string,
    unknown
  >;
  await writeReport(options, summary, review, data);
  console.log("レポート: " + input.reportMarkdown);
  return data;
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
