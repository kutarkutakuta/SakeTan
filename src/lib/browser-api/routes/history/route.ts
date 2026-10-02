import { authorization, supabase } from "@/lib/supabase/browser";
import type { History } from "@/lib/types";
import { z } from "zod";

const entityTypes = new Set(["shop", "brand", "brewery", "shop_brand"]);
const actorFilters = new Set(["non_admin", "all"]);

type HistoryPageRow = Omit<History, "users"> & {
  user_name: string;
  total_count: number | string;
};

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const requestedType = searchParams.get("type") ?? "";
  const type = entityTypes.has(requestedType) ? requestedType : "";
  const requestedId = searchParams.get("id");
  const id = requestedId ? z.uuid().safeParse(requestedId) : null;
  if (id && !id.success)
    return Response.json({ error: "対象IDが不正です" }, { status: 400 });
  const requestedShopId = searchParams.get("shop_id");
  const shopId = requestedShopId ? z.uuid().safeParse(requestedShopId) : null;
  if (shopId && !shopId.success)
    return Response.json({ error: "酒屋IDが不正です" }, { status: 400 });
  const requestedActor = searchParams.get("actor") ?? "non_admin";
  if (!actorFilters.has(requestedActor))
    return Response.json({ error: "ユーザー条件が不正です" }, { status: 400 });
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(searchParams.get("page"))) || 1),
  );
  const db = await supabase();
  if (!db)
    return Response.json({
      histories: [],
      count: 0,
      page,
      admin: false,
      canRestoreKana: false,
      names: {},
    });

  const [historyResult, account] = await Promise.all([
    db.rpc("history_page", {
      p_entity_type: type || null,
      p_entity_id: id?.success ? id.data : null,
      p_shop_id: shopId?.success ? shopId.data : null,
      p_include_admin: requestedActor === "all",
      p_offset: (page - 1) * 30,
      p_limit: 30,
    }),
    authorization(),
  ]);
  if (historyResult.error)
    return Response.json(
      { error: "履歴を取得できませんでした" },
      { status: 500 },
    );

  const rows = (historyResult.data ?? []) as unknown as HistoryPageRow[];
  const histories: History[] = rows.map(
    ({ user_name, total_count: _totalCount, ...history }) => ({
      ...history,
      users: { name: user_name },
    }),
  );
  const references = [
    ["brewery_id", "breweries"],
    ["shop_id", "shops"],
    ["brand_id", "brands"],
    ["merged_into_brand_id", "brands"],
  ] as const;
  const nameResults = await Promise.all(
    references.map(async ([field, table]) => {
      const ids = [
        ...new Set(
          histories
            .flatMap((history) => [
              history.before_data?.[field],
              history.after_data?.[field],
            ])
            .filter((value): value is string => typeof value === "string"),
        ),
      ];
      if (!ids.length) return [];
      const { data } = await db.from(table).select("id,name").in("id", ids);
      return data ?? [];
    }),
  );
  const names = Object.fromEntries(
    nameResults.flat().map((row) => [row.id, row.name]),
  );

  return Response.json(
    {
      histories,
      count: Number(rows[0]?.total_count ?? 0),
      page,
      admin: account.admin,
      canRestoreKana: Boolean(account.user && !account.anonymous),
      names,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
