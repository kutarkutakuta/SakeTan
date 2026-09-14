import { supabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import {
  anonymousTransferCookie,
  anonymousTransferCookieOptions,
} from "@/lib/auth-transfer";
import { NextResponse } from "next/server";
import type { Provider } from "@supabase/supabase-js";

const providers = new Set<Provider>(["google", "x", "facebook"]);
export async function GET(request: Request) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const db = await supabase();
  if (!db)
    return NextResponse.redirect(
      new URL(
        "/?error=" +
          encodeURIComponent("ログインにはSupabaseの接続設定が必要です。"),
        origin,
      ),
    );
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const requested = new URL(request.url).searchParams.get("provider");
  const provider = providers.has(requested as Provider)
    ? (requested as Provider)
    : "google";
  const {
    data: { user },
  } = await db.auth.getUser();
  const anonymous = Boolean(user?.is_anonymous);
  let transferToken: string | null = null;
  if (anonymous) {
    const { data, error } = await db.rpc("begin_anonymous_account_transfer");
    if (error || !data)
      return NextResponse.redirect(
        new URL(
          "/login?error=" +
            encodeURIComponent(
              "匿名の操作履歴を引き継ぐ準備ができませんでした。もう一度お試しください。",
            ),
          origin,
        ),
      );
    transferToken = String(data);
  }
  const credentials = {
    provider,
    options: {
      redirectTo: origin + "/auth/callback?next=" + encodeURIComponent(next),
    },
  };
  const { data, error } =
    user && !anonymous
      ? await db.auth.linkIdentity(credentials)
      : await db.auth.signInWithOAuth(credentials);
  if (error || !data.url)
    return NextResponse.redirect(
      new URL(
        "/login?error=" +
          encodeURIComponent(
            user && !anonymous
              ? "このログイン方法を連携できませんでした。別のアカウントで使用されていないか確認してください。"
              : "ログインを開始できませんでした。",
          ),
        origin,
      ),
    );
  const response = NextResponse.redirect(data.url);
  if (transferToken)
    response.cookies.set(
      anonymousTransferCookie,
      transferToken,
      anonymousTransferCookieOptions(),
    );
  return response;
}
