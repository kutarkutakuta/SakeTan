import { createHash } from "node:crypto";
import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { Prefecture } from "./prefectures";
import { prefectureUrl } from "./prefectures";
import type { ParsedShop, ParseResult, ParseWarning } from "./types";

const detailPattern =
  /^https?:\/\/(?:www\.)?sakeno\.com\/sakaya\/(\d+)\/?(?:[?#].*)?$/i;
const japaneseAddressPattern =
  /(?:北海道|東京都|(?:京都|大阪)府|.{2,3}県)[^\n<>]{2,160}/;

export function cleanText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .normalize("NFKC")
    .replace(/[ \t]+/g, " ")
    .trim();
}
export function normalizeShopName(value: string) {
  return cleanText(value).toLocaleLowerCase("ja-JP").replace(/\s+/g, "");
}
export function normalizeAddress(value: string) {
  return cleanText(value).replace(/\s+/g, "");
}

function absoluteUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value, "https://www.sakeno.com/");
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function detailAnchor($: CheerioAPI, block: Cheerio<AnyNode>) {
  return block
    .find("a[href]")
    .filter((_, element) =>
      detailPattern.test(absoluteUrl($(element).attr("href")) ?? ""),
    )
    .first();
}

export function findShopBlocks($: CheerioAPI): Cheerio<AnyNode>[] {
  const blocks: Cheerio<AnyNode>[] = [];
  const seen = new Set<AnyNode>();
  $("a[href]").each((_, element) => {
    const href = absoluteUrl($(element).attr("href"));
    if (!href || !detailPattern.test(href)) return;
    const block = $(element).closest("td, article, li, section, div").first();
    const node = block.get(0);
    if (node && !seen.has(node)) {
      seen.add(node);
      blocks.push(block);
    }
  });
  if (blocks.length) return blocks;
  $("table.hyoji tr > td, article, li").each((_, element) => {
    const block = $(element);
    if (japaneseAddressPattern.test(block.text())) blocks.push(block);
  });
  return blocks;
}

export function parseShopName($: CheerioAPI, block: Cheerio<AnyNode>) {
  const known = block.find("strong.lrg a, .lrg a, h2 a, h3 a, h4 a").first();
  return cleanText((known.length ? known : detailAnchor($, block)).text());
}

function valueByLabel(
  $: CheerioAPI,
  block: Cheerio<AnyNode>,
  labels: string[],
) {
  let value = "";
  block.find("th, dt, .label").each((_, element) => {
    if (
      value ||
      !labels.some((label) => cleanText($(element).text()).includes(label))
    )
      return;
    const next = $(element).is("dt")
      ? $(element).next("dd")
      : $(element).next("td, .value");
    value = cleanText(next.text());
  });
  return value || null;
}

export function parseShopKana($: CheerioAPI, block: Cheerio<AnyNode>) {
  const labeled = valueByLabel($, block, ["よみ", "読み", "ふりがな"]);
  if (labeled) return labeled;
  const kana = cleanText(
    block.find(".smls, .kana, [data-field='kana']").first().text(),
  );
  return kana || null;
}

function blockLines($: CheerioAPI, block: Cheerio<AnyNode>) {
  const details = block.find(".smll, .shop-detail, address").first();
  const clone = (details.length ? details : block).clone();
  clone.find("br").replaceWith("\n");
  return clone.text().split(/\r?\n/).map(cleanText).filter(Boolean);
}

export function parseAddress(
  $: CheerioAPI,
  block: Cheerio<AnyNode>,
  prefecture: Prefecture,
) {
  const labeled = valueByLabel($, block, ["住所", "所在地"]);
  if (labeled) return cleanText(labeled.replace(/^〒\s*\d{3}-?\d{4}\s*/, ""));
  const line = blockLines($, block).find((value) =>
    value.startsWith(prefecture.name),
  );
  if (line) return cleanText(line);
  const match = cleanText(block.text()).match(japaneseAddressPattern);
  return match ? cleanText(match[0].split(/(?:TEL|電話|FAX)/i)[0]) : "";
}

export function parseWebsiteUrl($: CheerioAPI, block: Cheerio<AnyNode>) {
  const labeled = valueByLabel($, block, ["ホームページ", "URL", "Web"]);
  const candidates: string[] = [];
  if (labeled) candidates.push(labeled);
  block.find("a[href]").each((_, element) => {
    candidates.push($(element).attr("href") ?? "");
  });
  for (const candidate of candidates) {
    const href = absoluteUrl(candidate);
    if (!href) continue;
    const hostname = new URL(href).hostname.replace(/^www\./, "");
    if (hostname !== "sakeno.com") return href;
  }
  return null;
}

export function parseSourceUrl($: CheerioAPI, block: Cheerio<AnyNode>) {
  return absoluteUrl(detailAnchor($, block).attr("href"));
}
export function parseSourceId(
  sourceUrl: string | null,
  name: string,
  address: string,
) {
  const match = sourceUrl?.match(detailPattern);
  if (match) return match[1];
  const stable =
    sourceUrl ?? `${normalizeShopName(name)}|${normalizeAddress(address)}`;
  return `sha256:${createHash("sha256").update(stable).digest("hex").slice(0, 24)}`;
}

export function parseCity(address: string, prefecture: Prefecture) {
  const rest = normalizeAddress(address).replace(
    new RegExp(`^${prefecture.name}`),
    "",
  );
  const designatedCities =
    "札幌|仙台|さいたま|千葉|横浜|川崎|相模原|新潟|静岡|浜松|名古屋|京都|大阪|堺|神戸|岡山|広島|北九州|福岡|熊本";
  const designated = rest.match(
    new RegExp(`^((?:${designatedCities})市.+?区)`),
  );
  if (designated) return designated[1];
  const county = rest.match(/^(.+?郡.+?[町村])/);
  if (county) return county[1];
  const municipality = rest.match(/^(.+?[市区町村])/);
  return municipality?.[1] ?? null;
}

export function parseShop(
  $: CheerioAPI,
  block: Cheerio<AnyNode>,
  prefecture: Prefecture,
): ParsedShop | null {
  const name = parseShopName($, block);
  const address = parseAddress($, block, prefecture);
  if (!name || !address) return null;
  const sourceUrl = parseSourceUrl($, block);
  return {
    source: "sakeno.com",
    sourceId: parseSourceId(sourceUrl, name, address),
    sourceUrl,
    name,
    nameKana: parseShopKana($, block),
    prefecture: prefecture.name,
    city: parseCity(address, prefecture),
    address,
    websiteUrl: parseWebsiteUrl($, block),
  };
}

export function parsePrefectureHtml(
  html: string,
  prefecture: Prefecture,
): ParseResult {
  const $ = load(html);
  const declaredEmpty = /現在のところ[^。]*登録されていません/.test(
    $("#maincontent").text(),
  );
  const blocks = declaredEmpty ? [] : findShopBlocks($);
  const shops: ParsedShop[] = [];
  const warnings: ParseWarning[] = [];
  let errors = 0;
  for (const block of blocks) {
    try {
      const shop = parseShop($, block, prefecture);
      if (!shop) {
        warnings.push({
          code: "missing_required",
          message: "店名または住所を取得できませんでした",
        });
        continue;
      }
      if (!shop.address.startsWith(prefecture.name)) {
        warnings.push({
          code: "prefecture_mismatch",
          message: `${prefecture.name}と住所が一致しません`,
          sourceId: shop.sourceId,
          name: shop.name,
        });
        continue;
      }
      shops.push(shop);
    } catch (error) {
      errors++;
      warnings.push({
        code: "parse_error",
        message: error instanceof Error ? error.message : "解析エラー",
      });
    }
  }
  const bySource = new Map<string, ParsedShop>();
  const byExact = new Map<string, ParsedShop>();
  for (const shop of shops) {
    const priorSource = bySource.get(shop.sourceId);
    const exact = `${normalizeShopName(shop.name)}|${normalizeAddress(shop.address)}`;
    const priorExact = byExact.get(exact);
    if (priorSource || priorExact) {
      warnings.push({
        code: "exact_duplicate",
        message: "完全一致する店舗候補を統合しました",
        sourceId: shop.sourceId,
        name: shop.name,
      });
      continue;
    }
    bySource.set(shop.sourceId, shop);
    byExact.set(exact, shop);
  }
  const unique = [...bySource.values()];
  const nameIndex = new Map<string, ParsedShop>();
  const addressIndex = new Map<string, ParsedShop>();
  for (const shop of unique) {
    const name = normalizeShopName(shop.name);
    const address = normalizeAddress(shop.address);
    if (
      (nameIndex.has(name) &&
        normalizeAddress(nameIndex.get(name)!.address) !== address) ||
      (addressIndex.has(address) &&
        normalizeShopName(addressIndex.get(address)!.name) !== name)
    )
      warnings.push({
        code: "similar_duplicate",
        message: "店名または住所が一致する別店舗候補です。自動統合していません",
        sourceId: shop.sourceId,
        name: shop.name,
      });
    nameIndex.set(name, shop);
    addressIndex.set(address, shop);
  }
  if (blocks.length > 0 && unique.length === 0)
    throw new Error(
      `${prefecture.name}: 候補${blocks.length}件に対して解析成功が0件です`,
    );
  if (blocks.length === 0)
    warnings.push({
      code: declaredEmpty ? "declared_empty" : "zero_candidates",
      message: declaredEmpty
        ? "サイト上で登録店舗0件と明記されています"
        : "店舗候補が0件でした",
    });
  return {
    prefecture: {
      id: prefecture.id,
      name: prefecture.name,
      sourceUrl: prefectureUrl(prefecture.id),
    },
    generatedAt: new Date().toISOString(),
    stats: {
      found: blocks.length,
      parsed: unique.length,
      skipped: blocks.length - shops.length + (shops.length - unique.length),
      errors,
    },
    shops: unique,
    warnings,
  };
}
