import { adminClient, paged } from "./supabase-admin";
import {
  areaSchema,
  brewerySchema,
  brandSchema,
  rankingSchema,
  fetchDataset,
  breweryRow,
  brandRow,
  namedRows,
} from "./sakenowa-data";
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const areas = areaSchema.parse(await fetchDataset("areas")).areas;
  const areaMap = new Map(areas.map((a) => [a.id, a.name]));
  const rawBreweries = brewerySchema.parse(
    await fetchDataset("breweries"),
  ).breweries;
  const rawBrands = brandSchema.parse(await fetchDataset("brands")).brands;
  const rankings = rankingSchema.parse(await fetchDataset("rankings"));
  const breweries = namedRows(rawBreweries);
  const brands = namedRows(rawBrands);
  if (!breweries.length || !brands.length)
    throw new Error("有効な酒蔵・銘柄がありません。取込を中止します。");
  console.log(
    `名称が空のレコードを除外: 酒蔵 ${rawBreweries.length - breweries.length} / 銘柄 ${rawBrands.length - brands.length}`,
  );
  if (dryRun) {
    console.log(
      `API検証成功: 地域 ${areas.length} / 酒蔵 ${breweries.length} / 銘柄 ${brands.length} / ${rankings.yearMonth} 総合ランキング ${rankings.overall.length}件（DB書き込みなし）`,
    );
    return;
  }
  const db = adminClient();
  for (let i = 0; i < breweries.length; i += 300) {
    const { error } = await db.from("breweries").upsert(
      breweries.slice(i, i + 300).map((b) => breweryRow(b, areaMap)),
      { onConflict: "source,source_id" },
    );
    if (error) throw new Error(error.message);
  }
  const saved = await paged<{ id: string; source_id: string }>((from, to) =>
    db
      .from("breweries")
      .select("id,source_id")
      .eq("source", "sakenowa")
      .order("id")
      .range(from, to),
  );
  const ids = new Map(saved.map((b) => [b.source_id, b.id]));
  for (let i = 0; i < brands.length; i += 300) {
    const { error } = await db.from("brands").upsert(
      brands.slice(i, i + 300).map((b) => brandRow(b, ids)),
      { onConflict: "source,source_id" },
    );
    if (error) throw new Error(error.message);
  }
  const { error: clearRankingError } = await db
    .from("brands")
    .update({
      sakenowa_rank: null,
      sakenowa_score: null,
      sakenowa_rank_year_month: null,
    })
    .eq("source", "sakenowa");
  if (clearRankingError) throw new Error(clearRankingError.message);
  for (const item of rankings.overall) {
    const { error } = await db
      .from("brands")
      .update({
        sakenowa_rank: item.rank,
        sakenowa_score: item.score,
        sakenowa_rank_year_month: rankings.yearMonth,
      })
      .eq("source", "sakenowa")
      .eq("source_id", String(item.brandId));
    if (error) throw new Error(error.message);
  }
  console.log(
    `インポート完了: 酒蔵 ${breweries.length} / 銘柄 ${brands.length} / ${rankings.yearMonth} 総合ランキング ${rankings.overall.length}件。かな・外部URLは生成していません。`,
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "インポートに失敗しました");
  process.exitCode = 1;
});
