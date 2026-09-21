import { authorization, supabase } from "@/lib/supabase/server";
import type { History } from "@/lib/types";

const entityTypes = new Set(["shop", "brand", "brewery", "shop_brand"]);

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const requestedType = searchParams.get("type") ?? "";
  const type = entityTypes.has(requestedType) ? requestedType : "";
  const id = searchParams.get("id")?.slice(0, 100) ?? "";
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
      names: {},
    });

  let query = db
    .from("change_histories")
    .select(
      "id,entity_type,entity_id,action,before_data,after_data,created_at,reason,users(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 30, page * 30 - 1);
  if (type) query = query.eq("entity_type", type);
  if (id) query = query.eq("entity_id", id);

  const [historyResult, account] = await Promise.all([query, authorization()]);
  if (historyResult.error)
    return Response.json(
      { error: "履歴を取得できませんでした" },
      { status: 500 },
    );

  const histories = (historyResult.data ?? []) as unknown as History[];
  const references = [
    ["brewery_id", "breweries"],
    ["shop_id", "shops"],
    ["brand_id", "brands"],
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
      count: historyResult.count ?? 0,
      page,
      admin: account.admin,
      names,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
