import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planSakenowaRankings,
  rankingReport,
  type ConfirmedRankingMapping,
  type RankingDatasets,
  type LocalRankingBrand,
  type LocalRankingBrewery,
} from "../scripts/sakenowa-ranking-plan";
import {
  compareShopBrands,
  shopBrandRankingLabel,
} from "../src/lib/shop-brand-order";
import type { Brand } from "../src/lib/types";

const datasets: RankingDatasets = {
  areas: [
    { id: 1, name: "北海道" },
    { id: 2, name: "青森県" },
  ],
  apiBrands: [{ id: 109, name: "試験の酒", breweryId: 100 }],
  apiBreweries: [{ id: 100, name: "試験酒造", areaId: 1 }],
  rankings: {
    yearMonth: "202609",
    overall: [{ brandId: 109, rank: 10, score: 4.5 }],
    areas: [{ areaId: 1, ranking: [{ brandId: 109, rank: 2, score: 4.2 }] }],
  },
};
const brewery: LocalRankingBrewery = {
  id: "brewery",
  name: "試験酒造",
  prefecture: "北海道",
  source: "sakenowa",
  source_id: "100",
  is_active: true,
};
const brand: LocalRankingBrand = {
  id: "local",
  name: "試験の酒",
  brewery_id: "brewery",
  source: "sakenowa",
  source_id: "109",
  is_active: true,
  registration_status: "approved",
  merged_into_brand_id: null,
};

test("rankings retain separate national and regional ranks/scores", () => {
  const plan = planSakenowaRankings(datasets, [brand], [brewery]);
  assert.equal(plan.selectedCount, 1);
  assert.equal(plan.issues.length, 0);
  assert.deepEqual(plan.updates, [
    {
      id: "local",
      rank: 10,
      score: 4.5,
      area_rank: 2,
      area_score: 4.2,
      area_id: 1,
      area_name: "北海道",
    },
  ]);
});
test("renamed brands keep their ranking by external ID without adopting same-name candidates", () => {
  const plan = planSakenowaRankings(
    datasets,
    [
      { ...brand, name: "別の商品" },
      { ...brand, id: "candidate", source: null, source_id: null },
    ],
    [brewery],
  );
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, "local");
  assert.equal(plan.updates[0].rank, 10);
  assert.equal(plan.updates[0].area_rank, 2);
  assert.equal(plan.issues.length, 0);
});
test("a confirmed merge resolves to its active target, with no reactivation", () => {
  const plan = planSakenowaRankings(
    datasets,
    [
      {
        ...brand,
        name: "統合前の変更された表記",
        is_active: false,
        registration_status: "merged",
        merged_into_brand_id: "target",
      },
      {
        ...brand,
        id: "target",
        name: "統合された表記",
        source: null,
        source_id: null,
      },
    ],
    [brewery],
  );
  assert.equal(plan.updates[0].id, "target");
  assert.equal(plan.issues.length, 0);
  const inactive = planSakenowaRankings(
    datasets,
    [{ ...brand, is_active: false }],
    [brewery],
  );
  assert.equal(inactive.updates.length, 0);
});

test("renamed IDs still reject duplicate IDs, unapproved targets, and brewery mismatches", () => {
  const renamed = { ...brand, name: "変更された表記" };
  for (const localBrands of [
    [renamed, { ...renamed, id: "duplicate" }],
    [{ ...renamed, registration_status: "pending" }],
    [{ ...renamed, is_active: false }],
    [{ ...renamed, brewery_id: "other" }],
    [{ ...renamed, source_id: "different" }],
  ]) {
    const plan = planSakenowaRankings(datasets, localBrands, [brewery]);
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.issues.length, 1);
  }
});
test("explicitly confirmed brand and brewery IDs allow rankings without changing masters", () => {
  const localBrewery = {
    ...brewery,
    name: "現在の酒蔵",
    source: null,
    source_id: null,
  };
  const confirmation: ConfirmedRankingMapping = {
    apiBrandId: 109,
    localBrandId: "local",
    apiBreweryId: 100,
    localBreweryId: "brewery",
    reason: "ユーザー確認済み",
  };
  assert.equal(
    planSakenowaRankings(datasets, [brand], [localBrewery]).updates.length,
    0,
  );
  const plan = planSakenowaRankings(
    datasets,
    [brand],
    [localBrewery],
    [confirmation],
  );
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].area_rank, 2);
  assert.equal(plan.issues.length, 0);
  assert.equal(plan.confirmedMatches.length, 1);
  assert.equal(plan.confirmedMatches[0].localBrewery, "現在の酒蔵");
  assert.ok(
    rankingReport(plan, "202609", true).includes(
      "ユーザー確認済みの個別対応: 1銘柄",
    ),
  );
  assert.equal(localBrewery.source_id, null);
  assert.equal(brand.brewery_id, "brewery");
});

test("confirmed exceptions still reject reassigned IDs, inactive masters, and region changes", () => {
  const localBrewery = { ...brewery, source: null, source_id: null };
  const confirmation: ConfirmedRankingMapping = {
    apiBrandId: 109,
    localBrandId: "local",
    apiBreweryId: 100,
    localBreweryId: "brewery",
    reason: "ユーザー確認済み",
  };
  for (const changed of [
    { apiBrandId: 110 },
    { localBrandId: "other" },
    { apiBreweryId: 101 },
    { localBreweryId: "other" },
  ]) {
    assert.equal(
      planSakenowaRankings(
        datasets,
        [brand],
        [localBrewery],
        [{ ...confirmation, ...changed }],
      ).updates.length,
      0,
    );
  }
  for (const changed of [{ is_active: false }, { prefecture: "青森県" }]) {
    assert.equal(
      planSakenowaRankings(
        datasets,
        [brand],
        [{ ...localBrewery, ...changed }],
        [confirmation],
      ).updates.length,
      0,
    );
  }
  for (const changed of [
    { is_active: false },
    { registration_status: "pending" },
    { source_id: "other" },
    { brewery_id: null },
  ]) {
    assert.equal(
      planSakenowaRankings(
        datasets,
        [{ ...brand, ...changed }],
        [localBrewery],
        [confirmation],
      ).updates.length,
      0,
    );
  }
  assert.equal(
    planSakenowaRankings(
      {
        ...datasets,
        rankings: {
          ...datasets.rankings,
          areas: [
            { areaId: 2, ranking: [{ brandId: 109, rank: 1, score: 4.2 }] },
          ],
        },
      },
      [brand],
      [localBrewery],
      [confirmation],
    ).updates.length,
    0,
  );
});

test("brewery and region mismatch, missing catalogs, and broken/cyclic merges require review", () => {
  assert.equal(
    planSakenowaRankings(datasets, [brand], [{ ...brewery, source_id: "101" }])
      .updates.length,
    0,
  );
  assert.equal(
    planSakenowaRankings(
      {
        ...datasets,
        rankings: {
          ...datasets.rankings,
          areas: [
            { areaId: 2, ranking: [{ brandId: 109, rank: 1, score: 4.2 }] },
          ],
        },
      },
      [brand],
      [brewery],
    ).updates.length,
    0,
  );
  assert.equal(
    planSakenowaRankings({ ...datasets, apiBrands: [] }, [brand], [brewery])
      .updates.length,
    0,
  );
  for (const target of ["missing", "local"]) {
    assert.equal(
      planSakenowaRankings(
        datasets,
        [
          {
            ...brand,
            registration_status: "merged",
            merged_into_brand_id: target,
          },
        ],
        [brewery],
      ).updates.length,
      0,
    );
  }
});
test("regional selection uses rank <= 5, excludes lower ranks, and rejects duplicates", () => {
  const ranking = {
    ...datasets.rankings,
    overall: [],
    areas: [{ areaId: 1, ranking: [{ brandId: 109, rank: 6, score: 4.2 }] }],
  };
  assert.equal(
    planSakenowaRankings({ ...datasets, rankings: ranking }, [brand], [brewery])
      .selectedCount,
    0,
  );
  assert.throws(
    () =>
      planSakenowaRankings(
        {
          ...datasets,
          rankings: {
            ...datasets.rankings,
            overall: [
              ...datasets.rankings.overall,
              ...datasets.rankings.overall,
            ],
          },
        },
        [brand],
        [brewery],
      ),
    /重複ID/,
  );
});
test("shop ordering prioritizes national ranks, then regional top five, then readings", () => {
  const local = (
    id: string,
    kana: string,
    fields: Partial<Brand> = {},
  ): Brand => ({ id, name: id, name_kana: kana, brewery_id: null, ...fields });
  const brands = [
    local("unranked-z", "わ"),
    local("regional-6", "か", { sakenowa_area_rank: 6 }),
    local("national-20", "あ", { sakenowa_rank: 20 }),
    local("regional-2", "い", {
      sakenowa_area_rank: 2,
      sakenowa_area_name: "青森県",
    }),
    local("unranked-a", "ア"),
    local("national-3", "わ", { sakenowa_rank: 3 }),
  ];
  assert.deepEqual(
    brands.sort(compareShopBrands).map((b) => b.id),
    [
      "national-3",
      "national-20",
      "regional-2",
      "unranked-a",
      "regional-6",
      "unranked-z",
    ],
  );
  assert.equal(shopBrandRankingLabel(brands[2]), "さけのわ青森県2位");
  assert.equal(shopBrandRankingLabel(brands[4]), null);
});
