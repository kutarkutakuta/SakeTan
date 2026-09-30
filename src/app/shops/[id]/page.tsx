import { Suspense } from "react";
import type { Metadata } from "next";
import { ShopPageLoader } from "@/components/shop-page-loader";

export const metadata: Metadata = {
  title: "酒屋情報",
  description: "酒屋の取扱銘柄、投稿、店舗情報を確認できます。",
};

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="page shop-page">
          <p className="muted">酒屋情報を読み込んでいます…</p>
        </main>
      }
    >
      <ShopPageLoader />
    </Suspense>
  );
}
