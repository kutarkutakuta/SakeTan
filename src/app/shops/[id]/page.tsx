import { Suspense } from "react";
import { ShopPageLoader } from "@/components/shop-page-loader";

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
