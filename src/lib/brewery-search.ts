import type { Brewery } from "@/lib/types";

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/gu, "");
}

function matchRank(brewery: Brewery, query: string) {
  const name = normalizeSearchText(brewery.name);
  const kana = normalizeSearchText(brewery.name_kana ?? "");

  if (name === query || kana === query) return 0;
  if (name.startsWith(query) || kana.startsWith(query)) return 1;
  if (name.includes(query) || kana.includes(query)) return 2;
  return 3;
}

export function prioritizeBrewerySearchResults(
  breweries: Brewery[],
  query: string,
  limit = 5,
) {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return breweries.slice(0, limit);

  return breweries
    .map((brewery, index) => ({
      brewery,
      index,
      rank: matchRank(brewery, normalizedQuery),
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map(({ brewery }) => brewery);
}
