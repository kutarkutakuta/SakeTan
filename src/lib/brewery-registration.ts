import { mutate } from "./client";
import { masterSchemas } from "./validation";
import type { Brewery } from "./types";

type BreweryRegistration = {
  name: string;
  nameKana: string;
  prefecture: string;
  websiteUrl: string;
};
type SaveBrewery = (body: unknown) => Promise<{ id: string }>;

export async function registerBrewery(
  input: BreweryRegistration,
  save: SaveBrewery = mutate,
): Promise<Brewery> {
  if (!input.name.trim()) throw new Error("酒蔵名を入力してください");
  const parsed = masterSchemas.brewery.safeParse({
    name: input.name.trim(),
    name_kana: input.nameKana.trim() || null,
    prefecture: input.prefecture || null,
    website_url: input.websiteUrl.trim() || null,
  });
  if (!parsed.success)
    throw new Error("酒蔵名・かな・公式サイトの入力内容を確認してください");
  const result = await save({
    kind: "master",
    type: "brewery",
    id: null,
    data: parsed.data,
    reason: null,
  });
  return { id: result.id, ...parsed.data, is_active: true };
}
