import { Suspense } from "react";
import { HomePageLoader } from "@/components/home-page-loader";
import { configured } from "@/lib/supabase/server";

export default function Page() {
  return (
    <Suspense fallback={<main id="main" className="explore" />}>
      <HomePageLoader ready={configured()} />
    </Suspense>
  );
}
