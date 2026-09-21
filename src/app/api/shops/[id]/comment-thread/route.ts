import { z } from "zod";
import { configured, supabase } from "@/lib/supabase/server";
import type { ShopComment, ShopCommentThread } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success)
    return Response.json(
      { error: "コメントの指定が不正です" },
      { status: 400 },
    );

  const db = await supabase();
  if (!db) {
    const response: ShopCommentThread = {
      comments: [],
      userId: null,
      admin: false,
      ready: false,
    };
    return Response.json(response);
  }

  const [commentResult, authResult] = await Promise.all([
    db
      .from("shop_comments")
      .select("id,shop_id,user_id,comment,commented_on,is_deleted,users(name)")
      .eq("shop_id", id.data)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false }),
    db.auth.getUser(),
  ]);
  if (commentResult.error)
    return Response.json(
      { error: "コメントを取得できませんでした" },
      { status: 500 },
    );

  const user = authResult.data.user;
  let admin = false;
  if (user && !user.is_anonymous) {
    const { data, error } = await db.rpc("is_admin");
    if (error)
      return Response.json(
        { error: "権限を確認できませんでした" },
        { status: 500 },
      );
    admin = Boolean(data);
  }

  const response: ShopCommentThread = {
    comments: (commentResult.data ?? []) as unknown as ShopComment[],
    userId: user?.is_anonymous ? null : (user?.id ?? null),
    admin,
    ready: configured(),
  };
  return Response.json(response);
}
