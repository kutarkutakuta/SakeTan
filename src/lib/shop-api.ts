import { z } from "zod";

export const mapShopLimit = 200;

export function mapShopCountLabel(total: number) {
  return total > mapShopLimit
    ? `${total}件中${mapShopLimit}件まで表示`
    : `${total}件`;
}

const shopIdsSchema = z.array(z.uuid()).min(1);

export function shopIdsFromRequest(request: Request, maximum = 50) {
  const ids = new URL(request.url).searchParams.get("ids") ?? "";
  const result = shopIdsSchema
    .max(maximum)
    .safeParse([...new Set(ids.split(",").filter(Boolean))]);
  return result.success ? result.data : null;
}

export function invalidShopIdsResponse() {
  return Response.json({ error: "酒屋IDを確認してください" }, { status: 400 });
}
