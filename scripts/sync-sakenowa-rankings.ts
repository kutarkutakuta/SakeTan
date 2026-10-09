import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { adminClient, paged } from "./supabase-admin";
import { confirmedRankingMappings } from "./sakenowa-ranking-confirmations";
import {
  areaSchema,
  brandSchema,
  brewerySchema,
  rankingSchema,
  fetchDataset,
} from "./sakenowa-data";
import {
  planSakenowaRankings,
  rankingReport,
  type LocalRankingBrand,
  type LocalRankingBrewery,
} from "./sakenowa-ranking-plan";

async function main() {
  const apply = process.argv.includes("--apply");
  const refresh = process.argv.includes("--refresh");
  const directory = resolve("data/sakenowa/ranking-audit");
  await mkdir(directory, { recursive: true });
  const [areaData, brandData, breweryData, rankingData] = await Promise.all(
    (["areas", "brands", "breweries", "rankings"] as const).map(
      async (path) => {
        const file = resolve(directory, `${path}.json`);
        if (!refresh) {
          try {
            return JSON.parse(await readFile(file, "utf8"));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        const data = await fetchDataset(path);
        await writeFile(file, JSON.stringify(data), "utf8");
        return data;
      },
    ),
  );
  const datasets = {
    areas: areaSchema.parse(areaData).areas,
    apiBrands: brandSchema.parse(brandData).brands,
    apiBreweries: brewerySchema.parse(breweryData).breweries,
    rankings: rankingSchema.parse(rankingData),
  };
  if (!datasets.rankings.overall.length)
    throw new Error("総合ランキングが空のため中止しました");
  const db = adminClient();
  const localBrands = await paged<LocalRankingBrand>((from, to) =>
    db
      .from("brands")
      .select(
        "id,name,brewery_id,source,source_id,is_active,registration_status,merged_into_brand_id",
      )
      .order("id")
      .range(from, to),
  );
  const localBreweries = await paged<LocalRankingBrewery>((from, to) =>
    db
      .from("breweries")
      .select("id,name,prefecture,source,source_id,is_active")
      .order("id")
      .range(from, to),
  );
  let plan = planSakenowaRankings(
    datasets,
    localBrands,
    localBreweries,
    confirmedRankingMappings,
  );
  const reportPath = resolve(directory, "report.md");
  await writeFile(
    reportPath,
    rankingReport(plan, datasets.rankings.yearMonth, false),
    "utf8",
  );
  if (apply) {
    if (!process.env.DATABASE_URL)
      throw new Error("反映にはDATABASE_URLが必要です");
    const sql = postgres(process.env.DATABASE_URL, {
      max: 1,
      prepare: false,
      ssl: "require",
      connect_timeout: 20,
    });
    try {
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(749128502)`;
        await tx`set local lock_timeout='15s'`;
        await tx`lock table public.brands,public.breweries in share row exclusive mode`;
        const currentBrands = await tx<
          LocalRankingBrand[]
        >`select id,name,brewery_id,source,source_id,is_active,registration_status,merged_into_brand_id from public.brands`;
        const currentBreweries = await tx<
          LocalRankingBrewery[]
        >`select id,name,prefecture,source,source_id,is_active from public.breweries`;
        plan = planSakenowaRankings(
          datasets,
          currentBrands,
          currentBreweries,
          confirmedRankingMappings,
        );
        if (!plan.updates.length)
          throw new Error("安全に照合できた銘柄がないため中止しました");
        const [newest] =
          await tx`select max(sakenowa_rank_year_month) as month from public.brands`;
        if (newest.month && newest.month > datasets.rankings.yearMonth)
          throw new Error(
            "DBに新しいランキングがあります。--refreshで再取得してください",
          );
        const previous =
          await tx`select id,sakenowa_rank,sakenowa_score,sakenowa_rank_year_month,
          sakenowa_area_rank,sakenowa_area_score,sakenowa_area_id,sakenowa_area_name from public.brands
          where sakenowa_rank is not null or sakenowa_area_rank is not null`;
        await writeFile(
          resolve(
            directory,
            `previous-rankings-${new Date().toISOString().replace(/[:.]/gu, "-")}.json`,
          ),
          JSON.stringify(previous, null, 2),
          "utf8",
        );
        // Update only ranking metadata, in one transaction. Unresolved/stale ranks
        // are cleared so that a repurposed external ID cannot keep a wrong rank.
        await tx`with incoming as (
          select * from jsonb_to_recordset(${tx.json(plan.updates)}::jsonb)
          as r(id uuid,rank integer,score double precision,area_rank integer,area_score double precision,area_id integer,area_name text)
        ), desired as (
          select b.id,r.rank,r.score,r.area_rank,r.area_score,r.area_id,r.area_name,
            case when r.id is not null then ${datasets.rankings.yearMonth}::text else null end as month
          from public.brands b left join incoming r on r.id=b.id
        ) update public.brands b set
          sakenowa_rank=d.rank,sakenowa_score=d.score,sakenowa_rank_year_month=d.month,
          sakenowa_area_rank=d.area_rank,sakenowa_area_score=d.area_score,
          sakenowa_area_id=d.area_id,sakenowa_area_name=d.area_name
        from desired d where b.id=d.id and
          row(b.sakenowa_rank,b.sakenowa_score,b.sakenowa_rank_year_month,b.sakenowa_area_rank,b.sakenowa_area_score,b.sakenowa_area_id,b.sakenowa_area_name)
          is distinct from row(d.rank,d.score,d.month,d.area_rank,d.area_score,d.area_id,d.area_name)`;
        const [verified] = await tx`with incoming as (
          select * from jsonb_to_recordset(${tx.json(plan.updates)}::jsonb)
          as r(id uuid,rank integer,score double precision,area_rank integer,area_score double precision,area_id integer,area_name text)
        ) select count(*)::integer as total from incoming r join public.brands b on b.id=r.id
          where row(b.sakenowa_rank,b.sakenowa_score,b.sakenowa_rank_year_month,b.sakenowa_area_rank,b.sakenowa_area_score,b.sakenowa_area_id,b.sakenowa_area_name)
          is not distinct from row(r.rank,r.score,${datasets.rankings.yearMonth}::text,r.area_rank,r.area_score,r.area_id,r.area_name)`;
        if (verified.total !== plan.updates.length)
          throw new Error("ランキングの書き込み結果が照合計画と一致しません");
      });
    } finally {
      await sql.end();
    }
    await writeFile(
      reportPath,
      rankingReport(plan, datasets.rankings.yearMonth, true),
      "utf8",
    );
  }
  await writeFile(
    resolve(directory, "plan.json"),
    JSON.stringify(plan, null, 2),
    "utf8",
  );
  await writeFile(
    resolve(directory, "issues.json"),
    JSON.stringify(plan.issues, null, 2),
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        month: datasets.rankings.yearMonth,
        selected: plan.selectedCount,
        matched: plan.updates.length,
        overall: plan.updates.filter((r) => r.rank != null).length,
        regional: plan.updates.filter((r) => r.area_rank != null).length,
        review: plan.issues.length,
        confirmed: plan.confirmedMatches.length,
        applied: apply,
        report: reportPath,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "ランキング照合失敗");
  process.exitCode = 1;
});
