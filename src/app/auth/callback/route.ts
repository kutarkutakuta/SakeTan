import { supabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const code = url.searchParams.get("code");
  const db = await supabase();
  if (code && db) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(safeNext(url.searchParams.get("next")), origin),
      );
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
