import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
export const configured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
export const supabase = cache(async () => {
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
            /* Read-only Server Component; a Route Handler refreshes cookies. */
          }
        },
      },
    },
  );
});

export const currentUser = cache(async () => {
  const db = await supabase();
  if (!db) return null;
  const {
    data: { user },
  } = await db.auth.getUser();
  return user;
});

export const viewerIdentity = cache(async () => {
  const [db, user] = await Promise.all([supabase(), currentUser()]);
  const anonymous = Boolean(user?.is_anonymous);
  const { data: profile } =
    db && user
      ? await db.from("users").select("name").eq("id", user.id).maybeSingle()
      : { data: null };
  return { user, anonymous, name: profile?.name ?? null };
});

export const authorization = cache(async () => {
  const [db, user] = await Promise.all([supabase(), currentUser()]);
  const anonymous = Boolean(user?.is_anonymous);
  const { data: admin } =
    db && user && !anonymous ? await db.rpc("is_admin") : { data: false };
  return {
    user,
    admin: Boolean(admin),
    anonymous,
  };
});

export const viewer = cache(async () => {
  const [identity, access] = await Promise.all([
    viewerIdentity(),
    authorization(),
  ]);
  return { ...identity, admin: access.admin };
});
