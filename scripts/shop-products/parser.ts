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
import { aliasEntries, confirmedAlias } from "./aliases";
import type { SourceProfile } from "./profiles";

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
    "新酒",
    "春酒",
    "夏酒",
    "秋酒",
    "ひやおろし",
    "秋あがり",
    "秋上がり",
  ].map((value) => normalizeProductName(value)),
);

function cleanProductName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function readableElementText($: CheerioAPI, element: Cheerio<AnyNode>) {
  return element
    .contents()
    .map((_, node) => {
      if (node.type === "text") return node.data;
      if (node.type === "tag" && node.name === "br") return "\n";
      return $(node).text();
    })
    .get()
    .join("");
}

function elementValue($: CheerioAPI, element: Cheerio<AnyNode>) {
  return (
    element.attr("content") ??
    element.attr("title") ??
    element.attr("alt") ??
    readableElementText($, element)
  );
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
  if (!name.length || name.length > 300) return null;
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

function elementName($: CheerioAPI, element: Cheerio<AnyNode>) {
  return usableName(elementValue($, element));
}

function pushProduct(
  results: ExtractedProduct[],
  name: unknown,
  sourceUrl: unknown,
  pageUrl: string,
  method: ExtractionMethod,
  details: Partial<
    Pick<ExtractedProduct, "sourceBreweryName" | "pageNumber" | "evidence">
  > = {},
) {
  if (typeof name !== "string") return;
  const cleaned = usableName(name);
  if (!cleaned) return;
  results.push({
    sourceName: cleaned,
    sourceBreweryName: details.sourceBreweryName ?? null,
    sourceUrl:
      typeof sourceUrl === "string" ? absoluteUrl(sourceUrl, pageUrl) : null,
    pageUrl,
    pageNumber: details.pageNumber ?? null,
    evidence: details.evidence ?? cleaned,
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
    const name = elementName($, element);
    if (!name) return;
    results.push({
      sourceName: name,
      sourceBreweryName: null,
      sourceUrl: elementUrl(element, pageUrl),
      pageUrl,
      pageNumber: null,
      evidence: name,
      method,
    });
  });
  return results;
}

function extractProfileGroups(
  $: CheerioAPI,
  profile: SourceProfile | null,
  pageUrl: string,
) {
  const results: ExtractedProduct[] = [];
  if (!profile?.itemContainerSelector || !profile.brandSelector) return results;
  const breweryPattern = profile.breweryPattern
    ? new RegExp(profile.breweryPattern, "u")
    : null;
  const brandSplitPattern = profile.brandSplitPattern
    ? new RegExp(profile.brandSplitPattern, "u")
    : null;
  $(profile.itemContainerSelector).each((_, node) => {
    const container = $(node);
    const breweryText = profile.brewerySelector
      ? container.find(profile.brewerySelector).first().text()
      : "";
    const breweryName = breweryText
      ? cleanProductName(
          breweryPattern?.exec(breweryText)?.[1] ?? breweryText,
        ) || null
      : null;
    container.find(profile.brandSelector).each((__, brandNode) => {
      const brand = $(brandNode);
      const name = elementValue($, brand);
      if (!name) return;
      for (const splitName of brandSplitPattern
        ? name.split(brandSplitPattern)
        : [name])
        pushProduct(
          results,
          splitName,
          elementUrl(brand, pageUrl),
          pageUrl,
          "selector",
          {
            sourceBreweryName: breweryName,
            evidence: breweryName ? `${name} / ${breweryName}` : name,
          },
        );
    });
  });
  return results;
}

function deduplicate(products: ExtractedProduct[]) {
  const byKey = new Map<string, ExtractedProduct>();
  const priority: Record<ExtractionMethod, number> = {
    "json-ld": 4,
    ai: 4,
    selector: 3,
    "brand-table": 3,
    category: 3,
    "pdf-text": 2,
    microdata: 2,
    heuristic: 1,
  };
  for (const product of products) {
    const key = `${normalizeProductName(product.sourceName)}\n${normalizeProductName(product.sourceBreweryName ?? "")}`;
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
        const brandCell =
          cells.length >= 3 ? cells.eq(cells.length - 2) : cells.eq(0);
        const breweryCell = cells.eq(cells.length - 1);
        const brandNames = cleanProductName(brandCell.text());
        const breweryName = cleanProductName(breweryCell.text());
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
        pushProduct(results, brandName, null, pageUrl, "brand-table", {
          sourceBreweryName: row.breweryName,
          evidence: `${row.brandNames} / ${row.breweryName}`,
        });
    }
  });
  return results;
}

function extractCategoryBrands($: CheerioAPI, pageUrl: string) {
  const results: ExtractedProduct[] = [];
  $('link[rel~="chapter"][title], a[data-category][title]').each((_, node) => {
    const element = $(node);
    const title = cleanProductName(element.attr("title") ?? "").replace(
      /\s*\|\s*CATEGORY$/i,
      "",
    );
    if (!title || /味醂|みりん|焼酎|ワイン|ビール|リキュール/.test(title))
      return;
    const bracket = title.match(/【([^】]+)】/);
    if (title.startsWith("【")) return;
    const breweryName = bracket?.[1].replace(/^\S+\s+/, "").trim() || null;
    const brandPart = title.replace(/【[^】]*】/g, "").trim();
    for (const brandName of brandPart
      .split(/[/／]/)
      .map((value) => value.trim()))
      pushProduct(
        results,
        brandName,
        element.attr("href"),
        pageUrl,
        "category",
        {
          sourceBreweryName: breweryName,
          evidence: title,
        },
      );
  });
  return results;
}

export function extractProducts(
  html: string,
  pageUrl: string,
  customSelector?: string,
  profile: SourceProfile | null = null,
) {
  const $ = load(html);
  const products = extractJsonLd($, pageUrl);
  products.push(...extractProfileGroups($, profile, pageUrl));
  if (customSelector)
    products.push(...extractElements($, customSelector, pageUrl, "selector"));
  products.push(...extractCategoryBrands($, pageUrl));
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

export function extractPdfTextProducts(
  pages: Array<{ pageNumber: number; text: string }>,
  pageUrl: string,
) {
  const products: ExtractedProduct[] = [];
  for (const page of pages) {
    for (const line of page.text.split(/\r?\n/))
      pushProduct(products, line, null, pageUrl, "pdf-text", {
        pageNumber: page.pageNumber,
        evidence: cleanProductName(line),
      });
  }
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
    '[class*="pagenavi" i] a',
    ".wp-pagenavi a",
  ];
  $(selectors.join(", ")).each((_, node) => {
    const element = $(node);
    const label = cleanProductName(
      element.attr("aria-label") ?? element.text(),
    ).toLocaleLowerCase("ja");
    const rel = element.attr("rel")?.toLocaleLowerCase("en") ?? "";
    const insidePager = Boolean(
      element.closest(
        '[class*="pagination" i], [class*="pager" i], [class*="pagenavi" i], .wp-pagenavi',
      ).length,
    );
    const isNext =
      rel.split(/\s+/).includes("next") ||
      /^(次|次へ|次の.+|next(?:\s+page)?|›|»|>)/i.test(label) ||
      /次|next/i.test(element.attr("aria-label") ?? "") ||
      (insidePager && /^\d+$/.test(label));
    if (!isNext) return;
    const url = absoluteUrl(element.attr("href"), pageUrl);
    if (url) {
      const current = new URL(pageUrl);
      const candidate = new URL(url);
      if (current.search && !candidate.search) return;
    }
    if (url && url !== pageUrl) links.add(url);
  });
  const collected = [...links];
  return collected.filter((value) => {
    const url = new URL(value);
    if (url.search) return true;
    return !collected.some((otherValue) => {
      const other = new URL(otherValue);
      return (
        other.origin === url.origin &&
        other.pathname === url.pathname &&
        Boolean(other.search)
      );
    });
  });
}

export function profileLinks(
  html: string,
  pageUrl: string,
  selector: string,
  textPattern?: string,
) {
  const $ = load(html);
  const pattern = textPattern ? new RegExp(textPattern, "u") : null;
  const links = new Set<string>();
  $(selector).each((_, node) => {
    const element = $(node);
    if (pattern && !pattern.test(cleanProductName(element.text()))) return;
    const url = absoluteUrl(element.attr("href"), pageUrl);
    if (url) links.add(url);
  });
  return [...links];
}

export function canonicalizeCatalogPrefixProducts(
  products: ExtractedProduct[],
  catalog: CatalogBrand[],
) {
  const catalogByName = new Map<string, CatalogBrand[]>();
  for (const brand of catalog) {
    const name = normalizeProductName(brand.name);
    catalogByName.set(name, [...(catalogByName.get(name) ?? []), brand]);
  }
  const uniqueCatalog = [...catalogByName.entries()]
    .filter(([, brands]) => brands.length === 1)
    .map(([name, brands]) => ({ name, brand: brands[0] }))
    .sort((left, right) => right.name.length - left.name.length);
  const aliases = aliasEntries()
    .filter(([alias]) => alias.length >= 2)
    .sort(([left], [right]) => right.length - left.length);

  return products.map((product) => {
    const leadingToken = cleanProductName(product.sourceName).split(
      /[\s\u3000()（）[\]［］【】「」『』:：'"“”‘’]+/u,
    )[0];
    const normalizedLeadingToken = normalizeProductName(leadingToken ?? "");
    const alias = aliases.find(([name]) => normalizedLeadingToken === name);
    const aliasBrands = alias
      ? catalogByName.get(normalizeProductName(alias[1]))
      : null;
    const aliasBrand = aliasBrands?.length === 1 ? aliasBrands[0] : null;
    const prefixBrand = uniqueCatalog.find(
      ({ name }) =>
        !genericSakeTerms.has(name) && normalizedLeadingToken === name,
    )?.brand;
    const brand = aliasBrand ?? prefixBrand;
    if (!brand) return product;
    return {
      ...product,
      sourceName: brand.name,
      sourceBreweryName: brand.breweryName,
      evidence: product.evidence
        ? `${product.evidence}; 商品名: ${product.sourceName}`
        : `商品名: ${product.sourceName}`,
    };
  });
}

function matchScore(product: ExtractedProduct, brand: CatalogBrand) {
  const sourceForMatch = product.sourceName.replace(/【[^】]*】/g, " ");
  const alias = confirmedAlias(cleanProductName(sourceForMatch));
  const brandName = normalizeProductName(brand.name);
  const aliasName = alias ? normalizeProductName(alias) : "";
  const productName =
    aliasName && brandName === aliasName
      ? aliasName
      : normalizeProductName(sourceForMatch);
  if (!brandName) return 0;
  const sourceBrewery = normalizeProductName(product.sourceBreweryName ?? "");
  const brewery = brand.breweryName
    ? normalizeProductName(brand.breweryName)
    : "";
  const breweryScore =
    sourceBrewery &&
    brewery &&
    (sourceBrewery === brewery ||
      sourceBrewery.includes(brewery) ||
      brewery.includes(sourceBrewery))
      ? 100
      : 0;
  if (productName === brandName) return 1000 + brandName.length + breweryScore;
  if (brandName.length < 2) return 0;
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
  if (brewery.length >= 2 && productName.includes(brewery)) score += 20;
  score += breweryScore;
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
  const alias = confirmedAlias(
    cleanProductName(product.sourceName.replace(/【[^】]*】/g, " ")),
  );
  const matchKind: MatchKind = exact
    ? tied
      ? "ambiguous"
      : alias
        ? "alias"
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

export function autoApproveReviewItems(items: ReviewItem[]) {
  const approvedBrandIds = new Set<string>();
  return items.map((item) => {
    const singleCharacterSafe =
      normalizeProductName(item.sourceName).length >= 2 ||
      Boolean(item.sourceBreweryName) ||
      ["json-ld", "selector", "brand-table", "category", "ai"].includes(
        item.method,
      );
    const safe =
      item.brandId &&
      ["exact", "alias"].includes(item.matchKind) &&
      singleCharacterSafe;
    const approved = Boolean(safe && !approvedBrandIds.has(item.brandId!));
    if (approved) approvedBrandIds.add(item.brandId!);
    return { ...item, approved };
  });
}

export function uniqueApprovedReviewItems(items: ReviewItem[]) {
  return [
    ...new Map(
      items.filter((item) => item.approved).map((item) => [item.brandId, item]),
    ).values(),
  ];
}
