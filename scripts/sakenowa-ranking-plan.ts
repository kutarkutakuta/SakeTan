import type { z } from "zod";
import type {
  areaSchema,
  brandSchema,
  brewerySchema,
  rankingSchema,
} from "./sakenowa-data";

export type LocalRankingBrand = {
  id: string;
  name: string;
  brewery_id: string | null;
  source: string | null;
  source_id: string | null;
  is_active: boolean;
  registration_status: string;
  merged_into_brand_id: string | null;
};
export type LocalRankingBrewery = {
  id: string;
  name: string;
  prefecture: string | null;
  source: string | null;
  source_id: string | null;
  is_active: boolean;
};
export type RankingDatasets = {
  areas: z.infer<typeof areaSchema>["areas"];
  apiBrands: z.infer<typeof brandSchema>["brands"];
  apiBreweries: z.infer<typeof brewerySchema>["breweries"];
  rankings: z.infer<typeof rankingSchema>;
};
export type RankingUpdate = {
  id: string;
  rank: number | null;
  score: number | null;
  area_rank: number | null;
  area_score: number | null;
  area_id: number | null;
  area_name: string | null;
};
export type RankingIssue = {
  apiId: number;
  apiName: string | null;
  apiBrewery: string | null;
  reason: string;
  localName: string | null;
  candidates: { id: string; name: string; brewery: string | null }[];
};

export type ConfirmedRankingMapping = {
  apiBrandId: number;
  localBrandId: string;
  apiBreweryId: number;
  localBreweryId: string;
  reason: string;
};

export function planSakenowaRankings(
  datasets: RankingDatasets,
  localBrands: LocalRankingBrand[],
  localBreweries: LocalRankingBrewery[],
  confirmedMappings: readonly ConfirmedRankingMapping[] = [],
) {
  const apiBrands = new Map(datasets.apiBrands.map((b) => [b.id, b]));
  const apiBreweries = new Map(datasets.apiBreweries.map((b) => [b.id, b]));
  const areas = new Map(datasets.areas.map((a) => [a.id, a.name]));
  const brandsById = new Map(localBrands.map((b) => [b.id, b]));
  const breweries = new Map(localBreweries.map((b) => [b.id, b]));
  const overall = new Map(datasets.rankings.overall.map((r) => [r.brandId, r]));
  if (overall.size !== datasets.rankings.overall.length)
    throw new Error("総合ランキングに重複IDがあります");
  const regional = new Map<
    number,
    { rank: number; score: number; areaId: number }
  >();
  for (const area of datasets.rankings.areas) {
    for (const item of area.ranking.filter((r) => r.rank <= 5)) {
      if (regional.has(item.brandId))
        throw new Error("地域ランキングに重複IDがあります");
      regional.set(item.brandId, { ...item, areaId: area.areaId });
    }
  }
  const selected = new Set([...overall.keys(), ...regional.keys()]);
  const updates = new Map<string, RankingUpdate>();
  const issues: RankingIssue[] = [];
  const confirmedMatches: {
    apiId: number;
    name: string;
    apiBrewery: string;
    localBrewery: string;
    reason: string;
  }[] = [];
  for (const apiId of selected) {
    const apiBrand = apiBrands.get(apiId);
    const apiBrewery =
      typeof apiBrand?.breweryId === "number"
        ? apiBreweries.get(apiBrand.breweryId)
        : undefined;
    const sources = localBrands.filter(
      (b) => b.source === "sakenowa" && b.source_id === String(apiId),
    );
    const source = sources[0];
    const regionalRank = regional.get(apiId);
    let target = source;
    let reason = "";
    let confirmedMatch: (typeof confirmedMatches)[number] | undefined;
    if (!apiBrand) reason = "APIの銘柄一覧にIDなし";
    else if (sources.length !== 1)
      reason = sources.length ? "外部IDが重複" : "外部IDの対応先なし";
    else if (!apiBrewery) reason = "APIの酒蔵を確認できない";
    else {
      const visited = new Set<string>();
      while (
        target?.registration_status === "merged" &&
        target.merged_into_brand_id
      ) {
        if (visited.has(target.id)) {
          reason = "統合先が循環している";
          break;
        }
        visited.add(target.id);
        target = brandsById.get(target.merged_into_brand_id)!;
      }
      const brewery = target
        ? breweries.get(target.brewery_id ?? "")
        : undefined;
      const confirmation = confirmedMappings.find(
        (mapping) =>
          mapping.apiBrandId === apiId &&
          mapping.localBrandId === target?.id &&
          mapping.apiBreweryId === apiBrewery.id &&
          mapping.localBreweryId === brewery?.id &&
          apiBrewery.areaId != null &&
          areas.get(apiBrewery.areaId) === brewery?.prefecture,
      );
      if (
        !reason &&
        (!target?.is_active || target.registration_status !== "approved")
      )
        reason = "対応先が無効・未承認";
      else if (
        !reason &&
        !(
          brewery?.is_active &&
          ((brewery.source === "sakenowa" &&
            brewery.source_id === String(apiBrewery.id)) ||
            confirmation)
        )
      )
        reason = "酒蔵IDが一致しない";
      else if (
        !reason &&
        regionalRank &&
        (regionalRank.areaId !== apiBrewery.areaId ||
          !areas.has(regionalRank.areaId))
      )
        reason = "地域IDが一致しない";
      if (!reason && confirmation && brewery) {
        confirmedMatch = {
          apiId,
          name: target.name,
          apiBrewery: apiBrewery.name,
          localBrewery: brewery.name,
          reason: confirmation.reason,
        };
      }
    }
    if (reason || !target) {
      issues.push({
        apiId,
        apiName: apiBrand?.name ?? null,
        apiBrewery: apiBrewery?.name ?? null,
        reason,
        localName: source?.name ?? null,
        candidates: localBrands
          .filter(
            (b) =>
              b.is_active &&
              b.registration_status === "approved" &&
              b.name === apiBrand?.name,
          )
          .map((b) => ({
            id: b.id,
            name: b.name,
            brewery: breweries.get(b.brewery_id ?? "")?.name ?? null,
          })),
      });
      continue;
    }
    const national = overall.get(apiId);
    if (confirmedMatch) confirmedMatches.push(confirmedMatch);
    const update: RankingUpdate = {
      id: target.id,
      rank: national?.rank ?? null,
      score: national?.score ?? null,
      area_rank: regionalRank?.rank ?? null,
      area_score: regionalRank?.score ?? null,
      area_id: regionalRank?.areaId ?? null,
      area_name: regionalRank ? areas.get(regionalRank.areaId)! : null,
    };
    const previous = updates.get(target.id);
    if (previous) {
      if (
        previous.area_id != null &&
        update.area_id != null &&
        previous.area_id !== update.area_id
      )
        throw new Error("同じ統合先に異なる地域のランキングがあります");
      if (
        previous.rank != null &&
        (update.rank == null || previous.rank <= update.rank)
      ) {
        update.rank = previous.rank;
        update.score = previous.score;
      }
      if (
        previous.area_rank != null &&
        (update.area_rank == null || previous.area_rank <= update.area_rank)
      ) {
        update.area_rank = previous.area_rank;
        update.area_score = previous.area_score;
        update.area_id = previous.area_id;
        update.area_name = previous.area_name;
      }
    }
    updates.set(target.id, update);
  }
  return {
    selectedCount: selected.size,
    updates: [...updates.values()],
    issues,
    confirmedMatches,
  };
}

export function rankingReport(
  plan: ReturnType<typeof planSakenowaRankings>,
  month: string,
  applied: boolean,
) {
  const cell = (value: string | null) =>
    (value ?? "不明").replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    "# さけのわランキング照合レポート",
    "",
    `- 対象月: ${month}`,
    `- 対象: 全国全件＋各地域5位以内（${plan.selectedCount}銘柄）`,
    `- 確認できた反映先: ${plan.updates.length}銘柄`,
    `- 要確認・除外: ${plan.issues.length}銘柄`,
    `- ユーザー確認済みの個別対応: ${plan.confirmedMatches.length}銘柄`,
    `- DB反映: ${applied ? "適用済み" : "なし"}`,
    "- 銘柄名・外部ID・有効状態の変更、新規マスタ作成は行いません。",
    "",
    "## 確認済みの個別対応",
    "",
    ...plan.confirmedMatches.map(
      (match) =>
        `- ${cell(match.name)}（API ID ${match.apiId}）: APIの酒蔵「${cell(match.apiBrewery)}」、現在の酒蔵「${cell(match.localBrewery)}」。${cell(match.reason)}`,
    ),
    "",
    "## 要確認",
    "",
    "| API ID | API銘柄名 | API酒蔵名 | 現在の銘柄名 | 理由 | 名称一致の候補（未確定） |",
    "| --- | --- | --- | --- | --- | --- |",
    ...plan.issues.map(
      (i) =>
        `| ${i.apiId} | ${cell(i.apiName)} | ${cell(i.apiBrewery)} | ${cell(i.localName)} | ${cell(i.reason)} | ${i.candidates.map((c) => `${cell(c.name)} / ${cell(c.brewery)} (${c.id})`).join("、") || "なし"} |`,
    ),
    "",
  ].join("\n");
}
