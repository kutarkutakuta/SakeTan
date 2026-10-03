import { z } from "zod";

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
