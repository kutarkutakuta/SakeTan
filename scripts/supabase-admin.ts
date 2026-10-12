import { createClient } from "@supabase/supabase-js";
import { setTimeout as sleep } from "node:timers/promises";

function scriptClient(
  keyVariable: "SUPABASE_SECRET_KEY" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[keyVariable];
  if (!url || !key)
    throw new Error(
      `環境変数 NEXT_PUBLIC_SUPABASE_URL と ${keyVariable} を設定してください。`,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function adminClient() {
  return scriptClient("SUPABASE_SECRET_KEY");
}

export function publicClient() {
  return scriptClient("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export async function paged<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  { wait = sleep }: { wait?: (milliseconds: number) => Promise<unknown> } = {},
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let result = await read(from, from + 999);
    // API keys can be translated into short-lived JWTs by Supabase. Retry
    // clock skew on the same read without skipping or duplicating a page.
    for (const delay of [1000, 2000, 4000]) {
      if (!result.error?.message.includes("JWT issued at future")) break;
      await wait(delay);
      result = await read(from, from + 999);
    }
    const { data, error } = result;
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
