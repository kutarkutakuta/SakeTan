import { adminClient, paged } from "./supabase-admin";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  areaSchema,
  brewerySchema,
  brandSchema,
  rankingSchema,
  fetchDataset,
  namedRows,
} from "./sakenowa-data";
import {
  compareSakenowaCatalog,
  renderSakenowaReviewReport,
} from "./sakenowa-import-report";

type ExistingBreweryRow = {
  id: string;
  source_id: string;
  name: string;
  prefecture: string | null;
  is_active: boolean;
};

type ExistingBrandRow = {
  source_id: string;
  name: string;
  brewery_id: string | null;
  is_active: boolean;
};

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
  const areaMap = new Map(areas.map((area) => [area.id, area.name]));
  const rawBreweries = brewerySchema.parse(
    await fetchDataset("breweries"),
  ).breweries;
  const rawBrands = brandSchema.parse(await fetchDataset("brands")).brands;
  const rankings = rankingSchema.parse(await fetchDataset("rankings"));
  const breweries = namedRows(rawBreweries);
  const brands = namedRows(rawBrands);
  if (!breweries.length || !brands.length)
    throw new Error("有効な酒蔵・銘柄がありません。確認を中止します。");
  console.log(
    `名称が空のレコードを除外: 酒蔵 ${rawBreweries.length - breweries.length} / 銘柄 ${rawBrands.length - brands.length}`,
  );
  if (dryRun) {
    console.log(
      `API検証成功: 地域 ${areas.length} / 酒蔵 ${breweries.length} / 銘柄 ${brands.length} / ${rankings.yearMonth} 総合ランキング ${rankings.overall.length}件（DB接続・書き込みなし）`,
    );
    return;
  }

  const db = adminClient();
  const [existingBreweries, existingBrands] = await Promise.all([
    paged<ExistingBreweryRow>((from, to) =>
      db
        .from("breweries")
        .select("id,source_id,name,prefecture,is_active")
        .eq("source", "sakenowa")
        .order("id")
        .range(from, to),
    ),
    paged<ExistingBrandRow>((from, to) =>
      db
        .from("brands")
        .select("source_id,name,brewery_id,is_active")
        .eq("source", "sakenowa")
        .order("id")
        .range(from, to),
    ),
  ]);
  const review = compareSakenowaCatalog({
    areas: areaMap,
    breweries,
    brands,
    existingBreweries: existingBreweries.map((brewery) => ({
      id: brewery.id,
      sourceId: brewery.source_id,
      name: brewery.name,
      prefecture: brewery.prefecture,
      isActive: brewery.is_active,
    })),
    existingBrands: existingBrands.map((brand) => ({
      sourceId: brand.source_id,
      name: brand.name,
      breweryId: brand.brewery_id,
      isActive: brand.is_active,
    })),
  });
  const report = renderSakenowaReviewReport({
    generatedAt: new Date().toISOString(),
    areaCount: areas.length,
    breweryCount: breweries.length,
    brandCount: brands.length,
    rankingYearMonth: rankings.yearMonth,
    rankingCount: rankings.overall.length,
    review,
  });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");

  console.log("確認レポートを作成しました（DB書き込みなし）。");
  console.log(
    `酒蔵候補: 新規 ${review.newBreweries.length} / 変更 ${review.changedBreweries.length} / API掲載なし ${review.missingBreweries.length}`,
  );
  console.log(
    `銘柄候補: 新規 ${review.newBrands.length} / 変更 ${review.changedBrands.length} / API掲載なし ${review.missingBrands.length}`,
  );
  console.log(`確認レポート: ${reportPath}`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "確認レポートの作成に失敗しました",
  );
  process.exitCode = 1;
});
