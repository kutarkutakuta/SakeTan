export type SakenowaBrandForReport = {
  id: number;
  name: string;
  breweryId?: number | string | null;
};

export type SakenowaBreweryForReport = {
  id: number;
  name: string;
};

export type NewSakenowaBrand = {
  sourceId: string;
  name: string;
  breweryName: string | null;
};

export function findNewSakenowaBrands(
  brands: SakenowaBrandForReport[],
  existingSourceIds: ReadonlySet<string>,
  breweries: SakenowaBreweryForReport[],
): NewSakenowaBrand[] {
  const breweryNames = new Map(
    breweries.map((brewery) => [String(brewery.id), brewery.name]),
  );
  const seen = new Set<string>();

  return brands.flatMap((brand) => {
    const sourceId = String(brand.id);
    if (existingSourceIds.has(sourceId) || seen.has(sourceId)) return [];
    seen.add(sourceId);
    return [
      {
        sourceId,
        name: brand.name,
        breweryName:
          brand.breweryId == null || brand.breweryId === ""
            ? null
            : (breweryNames.get(String(brand.breweryId)) ?? null),
      },
    ];
  });
}

function reportCell(value: string | null) {
  return (value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderSakenowaImportReport(input: {
  generatedAt: string;
  areaCount: number;
  breweryCount: number;
  brandCount: number;
  rankingYearMonth: string;
  rankingCount: number;
  newBrands: NewSakenowaBrand[];
}) {
  const lines = [
    "# さけのわ銘柄インポートレポート",
    "",
    `- 実行日時: ${input.generatedAt}`,
    `- API件数: 地域 ${input.areaCount} / 酒蔵 ${input.breweryCount} / 銘柄 ${input.brandCount}`,
    `- 総合ランキング: ${input.rankingYearMonth}・${input.rankingCount}件`,
    `- 今回の新規銘柄: ${input.newBrands.length}件`,
    "",
    "## 新規銘柄（かなを手動で付加してください）",
    "",
  ];

  if (input.newBrands.length === 0) {
    lines.push("今回、新規銘柄はありません。", "");
  } else {
    lines.push("| 銘柄名 | 酒蔵名 | さけのわID |", "| --- | --- | --- |");
    for (const brand of input.newBrands) {
      lines.push(
        `| ${reportCell(brand.name)} | ${reportCell(brand.breweryName)} | ${brand.sourceId} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "補足: さけのわAPIには銘柄かながないため、既存のかなは再インポートで上書きされません。",
    "",
  );
  return lines.join("\n");
}
