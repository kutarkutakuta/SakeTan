import type { ConfirmedRankingMapping } from "./sakenowa-ranking-plan";

// User-confirmed on 2026-10-09 after restoring the original Sakenowa brand IDs.
// Pin both the brand and brewery IDs so future reassignment requires a new review.
export const confirmedRankingMappings: readonly ConfirmedRankingMapping[] = [
  {
    apiBrandId: 902,
    localBrandId: "71b61be5-6236-42d8-813d-0898d3010035",
    apiBreweryId: 694,
    localBreweryId: "48225a49-8c9a-4d10-80eb-cd7d85ed7e04",
    reason:
      "同じ銘柄の外部IDであることをユーザーが確認。酒蔵マスターは変更しない。",
  },
  {
    apiBrandId: 1002,
    localBrandId: "3daf6a43-4023-42a1-8760-aae43c1a1ed8",
    apiBreweryId: 783,
    localBreweryId: "df1d69f7-73b6-4f3f-81f7-149819c841b2",
    reason:
      "同じ銘柄の外部IDであることをユーザーが確認。酒蔵マスターは変更しない。",
  },
];
