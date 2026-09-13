import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export const configured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
export async function supabase() {
  if (!configured()) return null;
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Read-only Server Component; proxy refreshes cookies. */
          }
        },
      },
    },
  );
}
export async function viewer() {
  const db = await supabase();
  if (!db) return { user: null, admin: false, anonymous: false, name: null };
  const {
    data: { user },
  } = await db.auth.getUser();
  const anonymous = Boolean(user?.is_anonymous);
  const [{ data: admin }, { data: profile }] = user
    ? await Promise.all([
        db.rpc("is_admin"),
        db.from("users").select("name").eq("id", user.id).maybeSingle(),
      ])
    : [{ data: false }, { data: null }];
  return {
    user,
    admin: Boolean(admin),
    anonymous,
    name: profile?.name ?? null,
  };
}
