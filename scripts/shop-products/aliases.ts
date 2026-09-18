import confirmedAliases from "../../config/shop-product-brand-aliases.json";

function normalizeAlias(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[寫冩]/g, "写")
    .replace(/國/g, "国")
    .replace(/[壽]/g, "寿")
    .replace(
      /[\s\u3000・･.,，。、/／\\_()（）\[\]［］【】「」『』:：'"“”‘’]/g,
      "",
    );
}

const normalizedAliases = new Map(
  Object.entries(confirmedAliases as Record<string, string>).map(
    ([alias, canonical]) => [normalizeAlias(alias), canonical],
  ),
);

export function confirmedAlias(value: string) {
  return normalizedAliases.get(normalizeAlias(value)) ?? null;
}

export function aliasEntries() {
  return [...normalizedAliases.entries()];
}
