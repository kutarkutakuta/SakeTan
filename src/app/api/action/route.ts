import { supabase } from "@/lib/supabase/server";
import { actionSchema, masterSchemas } from "@/lib/validation";
import { trustedRequestOrigin } from "@/lib/request-origin";
export async function POST(request: Request) {
  if (!trustedRequestOrigin(request))
    return Response.json(
      { error: "送信元を確認できませんでした" },
      { status: 403 },
    );
  const db = await supabase();
  if (!db)
    return Response.json(
      { error: "Supabaseの接続設定が必要です" },
      { status: 503 },
    );
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "入力内容をご確認ください" },
      { status: 400 },
    );
  const p = parsed.data;
  let {
    data: { user },
  } = await db.auth.getUser();
  const guestAllowed =
    p.kind === "post" ||
    p.kind === "shop_brand_status" ||
    p.kind === "brand_request";
  if (!user && guestAllowed) {
    const anonymous = await db.auth.signInAnonymously();
    if (anonymous.error || !anonymous.data.user)
      return Response.json(
        {
          error:
            "匿名での操作を開始できませんでした。Supabaseで匿名サインインを有効にしてください。",
        },
        { status: 503 },
      );
    user = anonymous.data.user;
  }
  if (!user)
    return Response.json(
      { error: "ログインしてからお試しください" },
      { status: 401 },
    );
  let result;
  if (p.kind === "post")
    result = await db.rpc("post_sighting", {
      p_shop_id: p.shop_id,
      p_brand_id: p.brand_id,
      p_observed_at: p.observed_at,
      p_comment: p.comment,
    });
  else if (p.kind === "sighting")
    result = await db.rpc("edit_sighting", {
      p_id: p.id,
      p_observed_at: p.observed_at,
      p_comment: p.comment,
      p_delete: p.is_deleted,
    });
  else if (p.kind === "shop_brand_status")
    result = await db.rpc("set_shop_brand_status", {
      p_shop_id: p.shop_id,
      p_brand_id: p.brand_id,
      p_status: p.status,
      p_reason: p.reason,
    });
  else if (p.kind === "brand_request")
    result = await db.rpc("submit_brand_request", {
      p_name: p.name,
      p_brewery_name: p.brewery_name,
      p_note: p.note,
      p_shop_id: p.shop_id,
    });
  else if (p.kind === "shop_comment")
    result = await db.rpc("post_shop_comment", {
      p_shop_id: p.shop_id,
      p_comment: p.comment,
    });
  else if (p.kind === "shop_comment_edit")
    result = await db.rpc("edit_shop_comment", {
      p_id: p.id,
      p_comment: p.comment,
      p_delete: p.is_deleted,
    });
  else if (p.kind === "restore")
    result = await db.rpc("restore_history", { p_history_id: p.id });
  else if (p.kind === "profile")
    result = await db.rpc("update_display_name", { p_name: p.name });
  else if (p.kind === "brand_request_review")
    result = await db.rpc("review_brand_request", {
      p_id: p.id,
      p_status: p.status,
    });
  else if (p.kind === "master_kana")
    result = await db.rpc("update_master_kana", {
      p_type: p.type,
      p_id: p.id,
      p_name_kana: p.name_kana,
      p_reason: p.reason,
    });
  else {
    const valid = masterSchemas[p.type].safeParse(p.data);
    if (!valid.success)
      return Response.json(
        { error: valid.error.issues[0]?.message ?? "入力内容をご確認ください" },
        { status: 400 },
      );
    result = await db.rpc("save_master", {
      p_type: p.type,
      p_id: p.id,
      p_data: valid.data,
      p_reason: p.reason,
    });
  }
  if (result.error) {
    const code = result.error.code;
    return Response.json(
      {
        error:
          code === "42501"
            ? "この操作を行う権限がありません"
            : code === "23505"
              ? "同じ情報が登録されています"
              : code === "23503"
                ? "関連する登録情報を確認してください"
                : code === "P0001"
                  ? result.error.message
                  : "保存できませんでした。入力内容を確認して再度お試しください。",
      },
      { status: code === "42501" ? 403 : 400 },
    );
  }
  return Response.json({ id: result.data });
}
