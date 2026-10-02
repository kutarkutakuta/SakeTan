import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareSakenowaCatalog,
  renderSakenowaReviewReport,
} from "../scripts/sakenowa-import-report";

function sampleReview() {
  return compareSakenowaCatalog({
    areas: new Map([
      [10, "山形県"],
      [11, "新潟県"],
    ]),
    breweries: [
      { id: 1, name: "更新後酒造", areaId: 10 },
      { id: 2, name: "新規酒造", areaId: 11 },
      { id: 4, name: "休止酒造", areaId: 10 },
    ],
    brands: [
      { id: 10, name: "更新後銘柄", breweryId: 1 },
      { id: 11, name: "新規|銘柄", breweryId: 2 },
      { id: 13, name: "休止銘柄", breweryId: 4 },
      { id: 14, name: "酒蔵不明銘柄", breweryId: 999 },
    ],
    existingBreweries: [
      {
        id: "brewery-1",
        sourceId: "1",
        name: "更新前酒造",
        prefecture: "宮城県",
        isActive: true,
      },
      {
        id: "brewery-3",
        sourceId: "3",
        name: "掲載終了酒造",
        prefecture: "長野県",
        isActive: true,
      },
      {
        id: "brewery-4",
        sourceId: "4",
        name: "休止酒造",
        prefecture: "山形県",
        isActive: false,
      },
    ],
    existingBrands: [
      {
        sourceId: "10",
        name: "更新前銘柄",
        breweryId: "brewery-3",
        isActive: true,
      },
      {
        sourceId: "12",
        name: "掲載終了銘柄",
        breweryId: "brewery-3",
        isActive: true,
      },
      {
        sourceId: "13",
        name: "休止銘柄",
        breweryId: "brewery-4",
        isActive: false,
      },
      {
        sourceId: "14",
        name: "酒蔵不明銘柄",
        breweryId: null,
        isActive: true,
      },
    ],
  });
}

test("compares Sake no Wa data without deciding master updates", () => {
  const review = sampleReview();

  assert.deepEqual(review.newBreweries, [
    { sourceId: "2", name: "新規酒造", prefecture: "新潟県" },
  ]);
  assert.deepEqual(review.changedBreweries[0]?.changes, ["名称", "都道府県"]);
  assert.deepEqual(review.changedBreweries[1]?.changes, ["有効状態"]);
  assert.deepEqual(
    review.missingBreweries.map((item) => item.sourceId),
    ["3"],
  );
  assert.deepEqual(review.newBrands, [
    {
      sourceId: "11",
      name: "新規|銘柄",
      breweryName: "新規酒造",
      brewerySourceId: "2",
    },
  ]);
  assert.deepEqual(review.changedBrands[0]?.changes, ["名称", "酒蔵"]);
  assert.deepEqual(review.changedBrands[1]?.changes, ["有効状態"]);
  assert.deepEqual(
    review.missingBrands.map((item) => item.sourceId),
    ["12"],
  );
});

test("renders a read-only master review report", () => {
  const report = renderSakenowaReviewReport({
    generatedAt: "2026-10-02T00:00:00.000Z",
    areaCount: 2,
    breweryCount: 3,
    brandCount: 3,
    rankingYearMonth: "202609",
    rankingCount: 100,
    review: sampleReview(),
  });

  assert.match(report, /DBへの書き込み: なし/);
  assert.match(report, /酒蔵候補: 新規 1 \/ 変更 2 \/ API掲載なし 1/);
  assert.match(report, /銘柄候補: 新規 1 \/ 変更 2 \/ API掲載なし 1/);
  assert.match(report, /新規\\\|銘柄/);
  assert.match(report, /自動で無効化・削除しません/);
  assert.match(report, /ランキングもDBへ書き込みません/);
});
