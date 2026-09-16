export type ExtractionMethod =
  "json-ld" | "microdata" | "selector" | "brand-table" | "heuristic";

export type CrawledPage = {
  url: string;
  file: string;
  fetchedAt: string;
  contentType: string;
  sha256: string;
};

export type CrawlManifest = {
  version: 1;
  sourceUrl: string;
  generatedAt: string;
  pages: CrawledPage[];
};

export type ExtractedProduct = {
  sourceName: string;
  sourceUrl: string | null;
  pageUrl: string;
  method: ExtractionMethod;
};

export type CatalogBrand = {
  id: string;
  name: string;
  nameKana: string | null;
  breweryName: string | null;
};

export type BrandMatch = {
  brandId: string;
  brandName: string;
  breweryName: string | null;
  score: number;
};

export type MatchKind = "exact" | "suggested" | "ambiguous" | "unmatched";

export type ReviewItem = ExtractedProduct & {
  matchKind: MatchKind;
  candidates: BrandMatch[];
  approved: boolean;
  brandId: string | null;
};

export type ShopProductReview = {
  version: 1;
  shop: { id: string; name: string };
  sourceUrl: string;
  fetchedAt: string;
  contentSha256: string;
  generatedAt: string;
  instructions: string;
  items: ReviewItem[];
};
