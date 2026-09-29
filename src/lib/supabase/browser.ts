import { createBrowserClient } from "@supabase/ssr";

export const configured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

let client: ReturnType<typeof createBrowserClient> | null = null;

export async function supabase() {
  if (!configured()) return null;
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}

export async function currentUser() {
  const db = await supabase();
  if (!db) return null;
  const {
    data: { user },
  } = await db.auth.getUser();
  return user;
}

export async function viewerIdentity() {
  const [db, user] = await Promise.all([supabase(), currentUser()]);
  const anonymous = Boolean(user?.is_anonymous);
  const { data: profile } =
    db && user
      ? await db.from("users").select("name").eq("id", user.id).maybeSingle()
      : { data: null };
  return { user, anonymous, name: profile?.name ?? null };
}

export async function authorization() {
  const [db, user] = await Promise.all([supabase(), currentUser()]);
  const anonymous = Boolean(user?.is_anonymous);
  const { data: admin } =
    db && user && !anonymous ? await db.rpc("is_admin") : { data: false };
  return { user, admin: Boolean(admin), anonymous };
}
