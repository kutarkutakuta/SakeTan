import { supabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { trustedRequestOrigin } from "@/lib/request-origin";
export async function POST(request: Request) {
  if (!trustedRequestOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const db = await supabase();
  await db?.auth.signOut();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return NextResponse.redirect(new URL("/", origin), 303);
}
