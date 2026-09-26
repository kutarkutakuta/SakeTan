export type ExtractionMethod =
  | "json-ld"
  | "microdata"
  | "selector"
  | "brand-table"
  | "category"
  | "pdf-text"
  | "ai"
  | "heuristic";

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
  truncated?: boolean;
};

export type ExtractedProduct = {
  sourceName: string;
  sourceBreweryName?: string | null;
  sourcePrefecture?: string | null;
  sourceUrl: string | null;
  pageUrl: string;
  pageNumber?: number | null;
  evidence?: string | null;
  method: ExtractionMethod;
};

export type StandardExtraction = {
  version: 1;
  sourceUrl: string;
  generatedAt: string;
  items: ExtractedProduct[];
};

export type CatalogBrand = {
  id: string;
  name: string;
  nameKana: string | null;
  breweryName: string | null;
  prefecture?: string | null;
};

export type BrandMatch = {
  brandId: string;
  brandName: string;
  breweryName: string | null;
  score: number;
};

export type MatchKind =
  "exact" | "alias" | "suggested" | "ambiguous" | "unmatched";

export type ReviewItem = ExtractedProduct & {
  matchKind: MatchKind;
  candidates: BrandMatch[];
  approved: boolean;
  brandId: string | null;
};

export type ShopProductReview = {
  version: 2;
  shop: { id: string; name: string };
  sourceUrl: string;
  fetchedAt: string;
  contentSha256: string;
  generatedAt: string;
  instructions: string;
  items: ReviewItem[];
};
