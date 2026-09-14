import { Home } from "@/components/home";
import { configured, supabase } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ brand_id?: string; error?: string }>;
}) {
  const params = await searchParams;
  let brand: Brand | null = null;
  const error = params.error;
  if (params.brand_id) {
    const db = await supabase();
    if (db) {
      const { data } = await db
        .from("brands")
        .select("*")
        .eq("id", params.brand_id)
        .maybeSingle();
      brand = data;
    }
  }
  return (
    <Home initialBrand={brand} ready={configured()} initialError={error} />
  );
}
