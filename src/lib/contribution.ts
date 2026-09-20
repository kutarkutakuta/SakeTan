type FavoriteShop = {
  shop_id: string;
  shop_name: string;
  contribution_count: number;
};

export type ContributionSummary = {
  shop_brand_count: number;
  shop_count: number;
  resolved_brand_request_count: number;
  favorite_shops: FavoriteShop[];
};

const contributionLevels = [
  { target: 1, name: "はじめの一献" },
  { target: 5, name: "酒屋めぐり" },
  { target: 20, name: "地酒案内人" },
  { target: 50, name: "まちの酒通" },
  { target: 100, name: "酒名人" },
] as const;

export function contributionAchievement(count: number) {
  const normalized = Math.max(0, Math.floor(count));
  const achieved = [...contributionLevels]
    .reverse()
    .find((level) => normalized >= level.target);
  const next = contributionLevels.find((level) => normalized < level.target);
  return {
    name: achieved?.name ?? "最初の登録に挑戦",
    next,
    value: next ? normalized : contributionLevels.at(-1)!.target,
    target: next?.target ?? contributionLevels.at(-1)!.target,
  };
}
