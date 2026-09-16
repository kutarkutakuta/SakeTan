import { unlinkIdentitySchema } from "@/lib/auth-identities";
import { trustedRequestOrigin } from "@/lib/request-origin";
import { supabase } from "@/lib/supabase/server";

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

  const parsed = unlinkIdentitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "解除するログイン方法を確認できませんでした" },
      { status: 400 },
    );

  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();
  if (userError || !user || user.is_anonymous)
    return Response.json(
      { error: "ログインしてからお試しください" },
      { status: 401 },
    );

  const identities = user.identities ?? [];
  if (identities.length <= 1)
    return Response.json(
      {
        error:
          "最後のログイン方法は解除できません。先に別のログイン方法を追加してください。",
      },
      { status: 409 },
    );

  const identity = identities.find(
    (candidate) =>
      candidate.identity_id === parsed.data.identity_id &&
      candidate.provider === parsed.data.provider,
  );
  if (!identity)
    return Response.json(
      { error: "このログイン方法は連携されていません" },
      { status: 404 },
    );

  const { error } = await db.auth.unlinkIdentity(identity);
  if (error)
    return Response.json(
      {
        error:
          "ログイン方法の連携を解除できませんでした。時間をおいてもう一度お試しください。",
      },
      { status: 400 },
    );

  return Response.json({ provider: parsed.data.provider });
}
