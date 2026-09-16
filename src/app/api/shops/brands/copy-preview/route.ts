import { z } from "zod";
import { supabase } from "@/lib/supabase/server";

const schema = z.object({
  source_id: z.uuid(),
  target_ids: z
    .string()
    .transform((value) => [...new Set(value.split(",").filter(Boolean))])
    .pipe(z.array(z.uuid()).min(1).max(10)),
});

export async function GET(request: Request) {
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json(
      { error: "コピー元とコピー先を確認してください" },
      { status: 400 },
    );

  const db = await supabase();
  if (!db)
    return Response.json(
      { error: "Supabaseの接続設定が必要です" },
      { status: 503 },
    );

  const { data, error } = await db.rpc("preview_shop_brand_copy", {
    p_source_shop_id: parsed.data.source_id,
    p_target_shop_ids: parsed.data.target_ids,
  });
  if (error)
    return Response.json(
      {
        error:
          error.code === "42501"
            ? "ログインしてからお試しください"
            : error.code === "P0001"
              ? error.message
              : "コピー内容を確認できませんでした",
      },
      { status: error.code === "42501" ? 403 : 400 },
    );

  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
