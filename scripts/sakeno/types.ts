export type ParsedShop = {
  source: "sakeno.com";
  sourceId: string;
  sourceUrl: string | null;
  name: string;
  nameKana: string | null;
  prefecture: string;
  city: string | null;
  address: string;
  websiteUrl: string | null;
};

export type ParseWarning = {
  code: string;
  message: string;
  sourceId?: string;
  name?: string;
};
export type ParseResult = {
  prefecture: { id: number; name: string; sourceUrl: string };
  generatedAt: string;
  stats: { found: number; parsed: number; skipped: number; errors: number };
  shops: ParsedShop[];
  warnings: ParseWarning[];
};

export type Phase = "fetch" | "parse" | "import";
export type PhaseStatus = "pending" | "success" | "failed";
export type ImportState = Record<
  Phase,
  Record<string, { status: PhaseStatus; updatedAt: string; message?: string }>
>;
