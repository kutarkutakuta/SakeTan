import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Route Handlers can persist refreshed cookies themselves. Proxy is only
    // needed before Server Components that read authentication state.
    "/account/:path*",
    "/admin/:path*",
    "/edit/:path*",
    "/login",
  ],
};
