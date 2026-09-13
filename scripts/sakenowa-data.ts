import { z } from "zod";
const externalId = z.number().int().nonnegative();
export const areaSchema = z.object({
  areas: z.array(z.object({ id: externalId, name: z.string().min(1) })).min(1),
});
export const brewerySchema = z.object({
  breweries: z
    .array(
      z.object({
        id: externalId,
        name: z.string().trim(),
        areaId: externalId.nullish(),
      }),
    )
    .min(1),
});
export const brandSchema = z.object({
  brands: z
    .array(
      z.object({
        id: externalId,
        name: z.string().trim(),
        breweryId: z.union([externalId, z.literal("")]).nullish(),
      }),
    )
    .min(1),
});
const rankingItemSchema = z.object({
  rank: z.number().int().positive(),
  score: z.number().min(0).max(5),
  brandId: externalId,
});
export const rankingSchema = z.object({
  yearMonth: z.string().regex(/^\d{6}$/),
  overall: z.array(rankingItemSchema),
  areas: z.array(
    z.object({
      areaId: externalId,
      ranking: z.array(rankingItemSchema),
    }),
  ),
});
export function namedRows<T extends { name: string }>(rows: T[]) {
  return rows.filter((row) => row.name.length > 0);
}
export async function fetchDataset(
  path: "areas" | "breweries" | "brands" | "rankings",
) {
  const response = await fetch(
    "https://muro.sakenowa.com/sakenowa-data/api/" + path,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok)
    throw new Error(`さけのわ ${path}: HTTP ${response.status}`);
  return response.json();
}
export function breweryRow(
  b: { id: number; name: string; areaId?: number | null },
  areas: Map<number, string>,
) {
  return {
    source: "sakenowa",
    source_id: String(b.id),
    name: b.name,
    prefecture: b.areaId != null ? (areas.get(b.areaId) ?? null) : null,
  };
}
export function brandRow(
  b: { id: number; name: string; breweryId?: number | string | null },
  breweries: Map<string, string>,
) {
  return {
    source: "sakenowa",
    source_id: String(b.id),
    name: b.name,
    brewery_id:
      b.breweryId != null && b.breweryId !== ""
        ? (breweries.get(String(b.breweryId)) ?? null)
        : null,
  };
}
