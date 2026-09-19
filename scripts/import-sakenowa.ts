import { adminClient, paged } from "./supabase-admin";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import {
  findNewSakenowaBrands,
  renderSakenowaImportReport,
} from "./sakenowa-import-report";
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const reportArgument = process.argv.find((argument) =>
    argument.startsWith("--report="),
  );
  const reportPath = resolve(
    reportArgument?.slice("--report=".length) ||
      "data/sakenowa/latest-import-report.md",
  );
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
  const existingBrands = await paged<{ source_id: string }>((from, to) =>
    db
      .from("brands")
      .select("source_id")
      .eq("source", "sakenowa")
      .order("id")
      .range(from, to),
  );
  const newBrands = findNewSakenowaBrands(
    brands,
    new Set(existingBrands.map((brand) => brand.source_id)),
    breweries.map((brewery) => ({ id: brewery.id, name: brewery.name })),
  );
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
  const report = renderSakenowaImportReport({
    generatedAt: new Date().toISOString(),
    areaCount: areas.length,
    breweryCount: breweries.length,
    brandCount: brands.length,
    rankingYearMonth: rankings.yearMonth,
    rankingCount: rankings.overall.length,
    newBrands,
  });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");
  console.log(
    `インポート完了: 酒蔵 ${breweries.length} / 銘柄 ${brands.length} / ${rankings.yearMonth} 総合ランキング ${rankings.overall.length}件。`,
  );
  console.log(`今回の新規銘柄: ${newBrands.length}件`);
  if (newBrands.length > 0 && newBrands.length <= 20) {
    for (const brand of newBrands)
      console.log(
        `- ${brand.name}${brand.breweryName ? `（${brand.breweryName}）` : ""}`,
      );
    console.log("上記の銘柄かなを手動で付加してください。");
  }
  console.log(`詳細レポート: ${reportPath}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "インポートに失敗しました");
  process.exitCode = 1;
});
