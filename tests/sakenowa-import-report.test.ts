import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findNewSakenowaBrands,
  renderSakenowaImportReport,
} from "../scripts/sakenowa-import-report";

test("finds only new Sake no Wa brands and resolves brewery names", () => {
  const result = findNewSakenowaBrands(
    [
      { id: 1, name: "既存銘柄", breweryId: 10 },
      { id: 2, name: "新規銘柄", breweryId: 10 },
      { id: 3, name: "蔵不明銘柄", breweryId: "999" },
    ],
    new Set(["1"]),
    [{ id: 10, name: "試験酒造" }],
  );

  assert.deepEqual(result, [
    { sourceId: "2", name: "新規銘柄", breweryName: "試験酒造" },
    { sourceId: "3", name: "蔵不明銘柄", breweryName: null },
  ]);
});

test("renders a kana follow-up report", () => {
  const report = renderSakenowaImportReport({
    generatedAt: "2026-09-18T00:00:00.000Z",
    areaCount: 1,
    breweryCount: 2,
    brandCount: 3,
    rankingYearMonth: "202609",
    rankingCount: 1,
    newBrands: [{ sourceId: "2", name: "新規|銘柄", breweryName: "試験酒造" }],
  });

  assert.match(report, /今回の新規銘柄: 1件/);
  assert.match(report, /新規\\|銘柄/);
  assert.match(report, /さけのわAPIには銘柄かながない/);
});
