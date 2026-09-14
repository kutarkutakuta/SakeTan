import { supabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import {
  anonymousTransferCookie,
  anonymousTransferCookieOptions,
} from "@/lib/auth-transfer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const code = url.searchParams.get("code");
  const db = await supabase();
  if (code && db) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      const jar = await cookies();
      const transferToken = jar.get(anonymousTransferCookie)?.value;
      let transferFailed = false;
      if (transferToken) {
        const { error: transferError } = await db.rpc(
          "claim_anonymous_account_transfer",
          { p_token: transferToken },
        );
        transferFailed = Boolean(transferError);
      }
      const response = NextResponse.redirect(
        new URL(
          transferFailed
            ? "/login?error=" +
                encodeURIComponent(
                  "ログインしましたが、匿名の操作履歴を引き継げませんでした。",
                )
            : safeNext(url.searchParams.get("next")),
          origin,
        ),
      );
      if (transferToken)
        response.cookies.set(anonymousTransferCookie, "", {
          ...anonymousTransferCookieOptions(),
          maxAge: 0,
        });
      return response;
    }
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=" +
        encodeURIComponent(
          "ログインできませんでした。もう一度お試しください。",
        ),
      origin,
    ),
  );
}
