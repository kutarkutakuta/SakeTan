import { Suspense } from "react";
import { HomeEntry } from "@/components/home-entry";
import { configured } from "@/lib/supabase/server";

// New records can still open before the next build. This fallback must not
// inherit the homepage canonical; its client sets the actual detail URL.
export const metadata = {
  title: "登録情報",
  description: "酒屋・日本酒銘柄・酒蔵の情報を確認できます。",
};

export default function DetailShell() {
  return (
    <Suspense fallback={<main id="main" className="page" />}>
      <HomeEntry ready={configured()} />
    </Suspense>
  );
}
