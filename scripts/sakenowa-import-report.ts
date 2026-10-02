export type SakenowaBrandForReport = {
  id: number;
  name: string;
  breweryId?: number | string | null;
};

export type SakenowaBreweryForReport = {
  id: number;
  name: string;
  areaId?: number | null;
};

export type ExistingSakenowaBrewery = {
  id: string;
  sourceId: string;
  name: string;
  prefecture: string | null;
  isActive: boolean;
};

export type ExistingSakenowaBrand = {
  sourceId: string;
  name: string;
  breweryId: string | null;
  isActive: boolean;
};

export type NewBreweryCandidate = {
  sourceId: string;
  name: string;
  prefecture: string | null;
};

export type ChangedBreweryCandidate = NewBreweryCandidate & {
  currentName: string;
  currentPrefecture: string | null;
  currentActive: boolean;
  changes: string[];
};

export type MissingBreweryCandidate = {
  sourceId: string;
  name: string;
  prefecture: string | null;
  currentActive: boolean;
};

export type NewBrandCandidate = {
  sourceId: string;
  name: string;
  breweryName: string | null;
  brewerySourceId: string | null;
};

export type ChangedBrandCandidate = NewBrandCandidate & {
  currentName: string;
  currentBreweryName: string | null;
  currentBrewerySourceId: string | null;
  currentActive: boolean;
  changes: string[];
};

export type MissingBrandCandidate = {
  sourceId: string;
  name: string;
  breweryName: string | null;
  currentActive: boolean;
};

export type SakenowaReview = {
  newBreweries: NewBreweryCandidate[];
  changedBreweries: ChangedBreweryCandidate[];
  missingBreweries: MissingBreweryCandidate[];
  newBrands: NewBrandCandidate[];
  changedBrands: ChangedBrandCandidate[];
  missingBrands: MissingBrandCandidate[];
};

export function compareSakenowaCatalog(input: {
  areas: ReadonlyMap<number, string>;
  breweries: SakenowaBreweryForReport[];
  brands: SakenowaBrandForReport[];
  existingBreweries: ExistingSakenowaBrewery[];
  existingBrands: ExistingSakenowaBrand[];
}): SakenowaReview {
  const apiBreweries = new Map(
    input.breweries.map((brewery) => [String(brewery.id), brewery]),
  );
  const existingBreweries = new Map(
    input.existingBreweries.map((brewery) => [brewery.sourceId, brewery]),
  );
  const existingBreweryById = new Map(
    input.existingBreweries.map((brewery) => [brewery.id, brewery]),
  );
  const breweryName = (sourceId: string | null) =>
    sourceId == null
      ? null
      : (apiBreweries.get(sourceId)?.name ??
        existingBreweries.get(sourceId)?.name ??
        null);

  const newBreweries: NewBreweryCandidate[] = [];
  const changedBreweries: ChangedBreweryCandidate[] = [];
  for (const brewery of apiBreweries.values()) {
    const sourceId = String(brewery.id);
    const prefecture =
      brewery.areaId == null ? null : (input.areas.get(brewery.areaId) ?? null);
    const current = existingBreweries.get(sourceId);
    if (!current) {
      newBreweries.push({ sourceId, name: brewery.name, prefecture });
      continue;
    }
    const changes: string[] = [];
    if (current.name !== brewery.name) changes.push("名称");
    if (current.prefecture !== prefecture) changes.push("都道府県");
    if (!current.isActive) changes.push("有効状態");
    if (changes.length)
      changedBreweries.push({
        sourceId,
        name: brewery.name,
        prefecture,
        currentName: current.name,
        currentPrefecture: current.prefecture,
        currentActive: current.isActive,
        changes,
      });
  }
  const missingBreweries = input.existingBreweries.flatMap((brewery) =>
    apiBreweries.has(brewery.sourceId)
      ? []
      : [
          {
            sourceId: brewery.sourceId,
            name: brewery.name,
            prefecture: brewery.prefecture,
            currentActive: brewery.isActive,
          },
        ],
  );

  const apiBrands = new Map(
    input.brands.map((brand) => [String(brand.id), brand]),
  );
  const existingBrands = new Map(
    input.existingBrands.map((brand) => [brand.sourceId, brand]),
  );
  const newBrands: NewBrandCandidate[] = [];
  const changedBrands: ChangedBrandCandidate[] = [];
  for (const brand of apiBrands.values()) {
    const sourceId = String(brand.id);
    const referencedBrewerySourceId =
      brand.breweryId == null || brand.breweryId === ""
        ? null
        : String(brand.breweryId);
    const brewerySourceId =
      referencedBrewerySourceId != null &&
      apiBreweries.has(referencedBrewerySourceId)
        ? referencedBrewerySourceId
        : null;
    const current = existingBrands.get(sourceId);
    if (!current) {
      newBrands.push({
        sourceId,
        name: brand.name,
        breweryName: breweryName(brewerySourceId),
        brewerySourceId,
      });
      continue;
    }
    const currentBrewery =
      current.breweryId == null
        ? null
        : (existingBreweryById.get(current.breweryId) ?? null);
    const currentBrewerySourceId = currentBrewery?.sourceId ?? null;
    const changes: string[] = [];
    if (current.name !== brand.name) changes.push("名称");
    if (currentBrewerySourceId !== brewerySourceId) changes.push("酒蔵");
    if (!current.isActive) changes.push("有効状態");
    if (changes.length)
      changedBrands.push({
        sourceId,
        name: brand.name,
        breweryName: breweryName(brewerySourceId),
        brewerySourceId,
        currentName: current.name,
        currentBreweryName: currentBrewery?.name ?? null,
        currentBrewerySourceId,
        currentActive: current.isActive,
        changes,
      });
  }
  const missingBrands = input.existingBrands.flatMap((brand) => {
    if (apiBrands.has(brand.sourceId)) return [];
    const currentBrewery =
      brand.breweryId == null
        ? null
        : (existingBreweryById.get(brand.breweryId) ?? null);
    return [
      {
        sourceId: brand.sourceId,
        name: brand.name,
        breweryName: currentBrewery?.name ?? null,
        currentActive: brand.isActive,
      },
    ];
  });

  return {
    newBreweries,
    changedBreweries,
    missingBreweries,
    newBrands,
    changedBrands,
    missingBrands,
  };
}

function reportCell(value: string | null) {
  return (value ?? "未登録").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function activeLabel(active: boolean) {
  return active ? "有効" : "無効";
}

export function renderSakenowaReviewReport(input: {
  generatedAt: string;
  areaCount: number;
  breweryCount: number;
  brandCount: number;
  rankingYearMonth: string;
  rankingCount: number;
  review: SakenowaReview;
}) {
  const { review } = input;
  const lines = [
    "# さけのわマスタ確認レポート",
    "",
    `- 実行日時: ${input.generatedAt}`,
    `- API件数: 地域 ${input.areaCount} / 酒蔵 ${input.breweryCount} / 銘柄 ${input.brandCount}`,
    `- 総合ランキング（参考）: ${input.rankingYearMonth}・${input.rankingCount}件`,
    "- DBへの書き込み: なし",
    `- 酒蔵候補: 新規 ${review.newBreweries.length} / 変更 ${review.changedBreweries.length} / API掲載なし ${review.missingBreweries.length}`,
    `- 銘柄候補: 新規 ${review.newBrands.length} / 変更 ${review.changedBrands.length} / API掲載なし ${review.missingBrands.length}`,
    "",
    "## 新規酒蔵候補",
    "",
  ];

  if (!review.newBreweries.length) lines.push("該当なし。", "");
  else {
    lines.push("| 酒蔵名 | 都道府県 | さけのわID |", "| --- | --- | --- |");
    for (const item of review.newBreweries)
      lines.push(
        `| ${reportCell(item.name)} | ${reportCell(item.prefecture)} | ${item.sourceId} |`,
      );
    lines.push("");
  }

  lines.push("## 酒蔵の変更候補", "");
  if (!review.changedBreweries.length) lines.push("該当なし。", "");
  else {
    lines.push(
      "| 変更項目 | 現在の名称 | APIの名称 | 現在の都道府県 | APIの都道府県 | 現在の状態 | さけのわID |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const item of review.changedBreweries)
      lines.push(
        `| ${item.changes.join("・")} | ${reportCell(item.currentName)} | ${reportCell(item.name)} | ${reportCell(item.currentPrefecture)} | ${reportCell(item.prefecture)} | ${activeLabel(item.currentActive)} | ${item.sourceId} |`,
      );
    lines.push("");
  }

  lines.push("## APIに掲載されなくなった酒蔵", "");
  if (!review.missingBreweries.length) lines.push("該当なし。", "");
  else {
    lines.push(
      "| 現在の酒蔵名 | 都道府県 | 現在の状態 | さけのわID |",
      "| --- | --- | --- | --- |",
    );
    for (const item of review.missingBreweries)
      lines.push(
        `| ${reportCell(item.name)} | ${reportCell(item.prefecture)} | ${activeLabel(item.currentActive)} | ${item.sourceId} |`,
      );
    lines.push("");
  }

  lines.push("## 新規銘柄候補", "");
  if (!review.newBrands.length) lines.push("該当なし。", "");
  else {
    lines.push(
      "| 銘柄名 | 酒蔵名 | 酒蔵のさけのわID | 銘柄のさけのわID |",
      "| --- | --- | --- | --- |",
    );
    for (const item of review.newBrands)
      lines.push(
        `| ${reportCell(item.name)} | ${reportCell(item.breweryName)} | ${reportCell(item.brewerySourceId)} | ${item.sourceId} |`,
      );
    lines.push("");
  }

  lines.push("## 銘柄の変更候補", "");
  if (!review.changedBrands.length) lines.push("該当なし。", "");
  else {
    lines.push(
      "| 変更項目 | 現在の銘柄名 | APIの銘柄名 | 現在の酒蔵 | APIの酒蔵 | 現在の状態 | さけのわID |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const item of review.changedBrands)
      lines.push(
        `| ${item.changes.join("・")} | ${reportCell(item.currentName)} | ${reportCell(item.name)} | ${reportCell(item.currentBreweryName)} | ${reportCell(item.breweryName)} | ${activeLabel(item.currentActive)} | ${item.sourceId} |`,
      );
    lines.push("");
  }

  lines.push("## APIに掲載されなくなった銘柄", "");
  if (!review.missingBrands.length) lines.push("該当なし。", "");
  else {
    lines.push(
      "| 現在の銘柄名 | 現在の酒蔵 | 現在の状態 | さけのわID |",
      "| --- | --- | --- | --- |",
    );
    for (const item of review.missingBrands)
      lines.push(
        `| ${reportCell(item.name)} | ${reportCell(item.breweryName)} | ${activeLabel(item.currentActive)} | ${item.sourceId} |`,
      );
    lines.push("");
  }

  lines.push(
    "候補は自動反映されません。公式情報を確認して管理画面から修正してください。API掲載なしの項目も自動で無効化・削除しません。ランキングもDBへ書き込みません。",
    "",
  );
  return lines.join("\n");
}
