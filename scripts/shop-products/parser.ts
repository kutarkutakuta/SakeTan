import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type {
  BrandMatch,
  CatalogBrand,
  ExtractedProduct,
  ExtractionMethod,
  MatchKind,
  ReviewItem,
} from "./types";

const ignoredNames = new Set([
  "home",
  "top",
  "トップ",
  "ホーム",
  "商品一覧",
  "商品詳細",
  "詳しく見る",
  "もっと見る",
  "次へ",
  "前へ",
  "カートに入れる",
  "売り切れ",
  "sold out",
]);

const genericSakeTerms = new Set(
  [
    "純米",
    "純米酒",
    "特別純米",
    "純米吟醸",
    "純米大吟醸",
    "吟醸",
    "大吟醸",
    "本醸造",
    "生酒",
    "原酒",
    "ひやおろし",
    "秋あがり",
    "秋上がり",
  ].map((value) => normalizeProductName(value)),
);

export function cleanProductName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeProductName(value: string) {
  return cleanProductName(value)
    .toLocaleLowerCase("ja")
    .replace(/[寫冩]/g, "写")
    .replace(/國/g, "国")
    .replace(
      /[\s\u3000・･.,，。、/／\\_()（）\[\]［］【】「」『』:：'"“”‘’]/g,
      "",
    );
}

function usableName(value: string) {
  const name = cleanProductName(value);
  if (name.length < 2 || name.length > 300) return null;
  if (ignoredNames.has(name.toLocaleLowerCase("ja"))) return null;
  if (/^[\d\s,.，。¥￥円税込%％+\-–—]+$/u.test(name)) return null;
  return name;
}

function absoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value || value.startsWith("javascript:") || value.startsWith("#"))
    return null;
  try {
    const resolved = new URL(value, baseUrl);
    return ["http:", "https:"].includes(resolved.protocol)
      ? resolved.toString()
      : null;
  } catch {
    return null;
  }
}

function elementUrl(element: Cheerio<AnyNode>, baseUrl: string) {
  const href = element.is("a")
    ? element.attr("href")
    : (element.closest("a[href]").attr("href") ??
      element.find("a[href]").first().attr("href"));
  return absoluteUrl(href, baseUrl);
}

function elementName(element: Cheerio<AnyNode>) {
  return usableName(
    element.attr("content") ??
      element.attr("title") ??
      element.attr("alt") ??
      element.text(),
  );
}

function pushProduct(
  results: ExtractedProduct[],
  name: unknown,
  sourceUrl: unknown,
  pageUrl: string,
  method: ExtractionMethod,
) {
  if (typeof name !== "string") return;
  const cleaned = usableName(name);
  if (!cleaned) return;
  results.push({
    sourceName: cleaned,
    sourceUrl:
      typeof sourceUrl === "string" ? absoluteUrl(sourceUrl, pageUrl) : null,
    pageUrl,
    method,
  });
}

function typeIncludesProduct(value: unknown) {
  const types = Array.isArray(value) ? value : [value];
  return types.some(
    (type) =>
      typeof type === "string" &&
      type.toLocaleLowerCase("en").split(/[\/#]/).at(-1) === "product",
  );
}

function walkJsonLd(
  value: unknown,
  pageUrl: string,
  results: ExtractedProduct[],
) {
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLd(item, pageUrl, results);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeIncludesProduct(record["@type"]))
    pushProduct(results, record.name, record.url, pageUrl, "json-ld");
  for (const child of Object.values(record))
    if (child && typeof child === "object") walkJsonLd(child, pageUrl, results);
}

function extractJsonLd($: CheerioAPI, pageUrl: string) {
  const results: ExtractedProduct[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      walkJsonLd(JSON.parse($(element).text()), pageUrl, results);
    } catch {
      // Broken JSON-LD should not prevent the HTML fallbacks from running.
    }
  });
  return results;
}

function extractElements(
  $: CheerioAPI,
  selector: string,
  pageUrl: string,
  method: ExtractionMethod,
) {
  const results: ExtractedProduct[] = [];
  $(selector).each((_, node) => {
    const element = $(node);
    const name = elementName(element);
    if (!name) return;
    results.push({
      sourceName: name,
      sourceUrl: elementUrl(element, pageUrl),
      pageUrl,
      method,
    });
  });
  return results;
}

function deduplicate(products: ExtractedProduct[]) {
  const byKey = new Map<string, ExtractedProduct>();
  const priority: Record<ExtractionMethod, number> = {
    "json-ld": 4,
    selector: 3,
    "brand-table": 3,
    microdata: 2,
    heuristic: 1,
  };
  for (const product of products) {
    const key = `${normalizeProductName(product.sourceName)}\n${product.sourceUrl ?? ""}`;
    const current = byKey.get(key);
    if (!current || priority[product.method] > priority[current.method])
      byKey.set(key, product);
  }
  return [...byKey.values()].sort((a, b) =>
    a.sourceName.localeCompare(b.sourceName, "ja"),
  );
}

function extractBrandTables($: CheerioAPI, pageUrl: string) {
  const results: ExtractedProduct[] = [];
  $("table").each((_, tableNode) => {
    const rows = $(tableNode)
      .find("tr")
      .map((_, rowNode) => {
        const cells = $(rowNode).find("td");
        if (cells.length < 2) return null;
        const brandNames = cleanProductName(cells.eq(0).text());
        const breweryName = cleanProductName(cells.eq(1).text());
        if (
          !brandNames ||
          !breweryName ||
          brandNames.length > 150 ||
          breweryName.length > 150
        )
          return null;
        return { brandNames, breweryName };
      })
      .get()
      .filter(
        (
          row,
        ): row is {
          brandNames: string;
          breweryName: string;
        } => Boolean(row),
      );
    if (rows.length < 5) return;
    const brewerySignals = rows.filter((row) =>
      /(酒造|醸造|酒蔵|酒店|商店|本店|酒造場|醸造所)/.test(row.breweryName),
    ).length;
    if (brewerySignals / rows.length < 0.4) return;
    for (const row of rows) {
      for (const brandName of row.brandNames.split(/\s+/))
        pushProduct(results, brandName, null, pageUrl, "brand-table");
    }
  });
  return results;
}

export function extractProducts(
  html: string,
  pageUrl: string,
  customSelector?: string,
) {
  const $ = load(html);
  const products = extractJsonLd($, pageUrl);
  if (customSelector)
    products.push(...extractElements($, customSelector, pageUrl, "selector"));
  products.push(...extractBrandTables($, pageUrl));
  products.push(
    ...extractElements(
      $,
      '[itemtype*="Product"] [itemprop="name"], [itemtype*="Product"][itemprop="name"], [itemprop="itemListElement"] [itemprop="name"]',
      pageUrl,
      "microdata",
    ),
  );
  products.push(
    ...extractElements(
      $,
      [
        '[class*="product" i] [class*="name" i]',
        '[class*="product" i] h2',
        '[class*="product" i] h3',
        '[class*="item" i] [class*="name" i]',
        '[class*="goods" i] [class*="name" i]',
        '[class*="shohin" i] [class*="name" i]',
        '[class*="syohin" i] [class*="name" i]',
      ].join(", "),
      pageUrl,
      "heuristic",
    ),
  );
  return deduplicate(products);
}

export function paginationLinks(html: string, pageUrl: string) {
  const $ = load(html);
  const links = new Set<string>();
  const selectors = [
    'a[rel~="next"]',
    'link[rel~="next"]',
    'a[aria-label*="次" i]',
    'a[aria-label*="next" i]',
    '[class*="pagination" i] a',
    '[class*="pager" i] a',
  ];
  $(selectors.join(", ")).each((_, node) => {
    const element = $(node);
    const label = cleanProductName(
      element.attr("aria-label") ?? element.text(),
    ).toLocaleLowerCase("ja");
    const rel = element.attr("rel")?.toLocaleLowerCase("en") ?? "";
    const isNext =
      rel.split(/\s+/).includes("next") ||
      /^(次|次へ|次の.+|next(?:\s+page)?|›|»|>)/i.test(label) ||
      /次|next/i.test(element.attr("aria-label") ?? "");
    if (!isNext) return;
    const url = absoluteUrl(element.attr("href"), pageUrl);
    if (url) links.add(url);
  });
  return [...links];
}

function matchScore(product: ExtractedProduct, brand: CatalogBrand) {
  const sourceForMatch = product.sourceName.replace(/【[^】]*】/g, " ");
  const productName = normalizeProductName(sourceForMatch);
  const brandName = normalizeProductName(brand.name);
  if (!brandName || brandName.length < 2) return 0;
  if (productName === brandName) return 1000 + brandName.length;
  if (genericSakeTerms.has(brandName)) return 0;
  if (
    product.method === "brand-table" &&
    productName.length >= 4 &&
    brandName.startsWith(productName)
  )
    return 90 + productName.length;
  const tokens = cleanProductName(sourceForMatch)
    .toLocaleLowerCase("ja")
    .split(/[\s\u3000・･.,，。、/／\\_()（）[\]［］【】「」『』:：'"“”‘’]+/)
    .map(normalizeProductName)
    .filter((token) => token && !token.endsWith("の地酒"));
  const tokenMatch = tokens.some((token) => token.startsWith(brandName));
  const startsWithBrand = tokens[0]?.startsWith(brandName) ?? false;
  if (!tokenMatch) return 0;
  let score = 100 + brandName.length * 2;
  if (startsWithBrand) score += 50;
  if (tokens.some((token) => token === brandName)) score += 25;
  const brewery = brand.breweryName
    ? normalizeProductName(brand.breweryName)
    : "";
  if (brewery.length >= 2 && productName.includes(brewery)) score += 20;
  return score;
}

export function matchProduct(
  product: ExtractedProduct,
  catalog: CatalogBrand[],
): Pick<ReviewItem, "matchKind" | "candidates" | "brandId"> {
  const candidates: BrandMatch[] = catalog
    .map((brand) => ({ brand, score: matchScore(product, brand) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.brand.name.localeCompare(b.brand.name, "ja"),
    )
    .slice(0, 5)
    .map(({ brand, score }) => ({
      brandId: brand.id,
      brandName: brand.name,
      breweryName: brand.breweryName,
      score,
    }));

  if (!candidates.length)
    return { matchKind: "unmatched", candidates, brandId: null };
  const exact = candidates[0].score >= 1000;
  const tied =
    candidates.length > 1 && candidates[0].score === candidates[1].score;
  const matchKind: MatchKind = exact
    ? tied
      ? "ambiguous"
      : "exact"
    : tied
      ? "ambiguous"
      : "suggested";
  return {
    matchKind,
    candidates,
    brandId: tied ? null : candidates[0].brandId,
  };
}

export function buildReviewItems(
  products: ExtractedProduct[],
  catalog: CatalogBrand[],
) {
  return products
    .map((product): ReviewItem => {
      const match = matchProduct(product, catalog);
      return { ...product, ...match, approved: false };
    })
    .sort((a, b) => {
      const aRank = a.brandId ? 0 : a.candidates.length ? 1 : 2;
      const bRank = b.brandId ? 0 : b.candidates.length ? 1 : 2;
      const aName =
        a.candidates.find((candidate) => candidate.brandId === a.brandId)
          ?.brandName ??
        a.candidates[0]?.brandName ??
        a.sourceName;
      const bName =
        b.candidates.find((candidate) => candidate.brandId === b.brandId)
          ?.brandName ??
        b.candidates[0]?.brandName ??
        b.sourceName;
      return (
        aRank - bRank ||
        aName.localeCompare(bName, "ja") ||
        a.sourceName.localeCompare(b.sourceName, "ja")
      );
    });
}
