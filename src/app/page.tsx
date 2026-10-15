import { Suspense } from "react";
import { HomeEntry } from "@/components/home-entry";
import { configured } from "@/lib/supabase/server";

export const metadata = { alternates: { canonical: "/" } };

export default function Page() {
  return (
    <Suspense fallback={<main id="main" className="explore" />}>
      <HomeEntry ready={configured()} />
    </Suspense>
  );
}
