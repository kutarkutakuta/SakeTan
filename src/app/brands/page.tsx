import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandStatusList } from "@/components/brand-status-list";

export default function BrandStatusesPage() {
  return (
    <main id="main" className="page registration-page">
      <Link href="/" className="back">
        <ArrowLeft size={17} />
        地図に戻る
      </Link>
      <div className="page-head">
        <div>
          <p className="eyebrow">登録状況と取扱店舗を確認</p>
          <h1>銘柄の状態</h1>
        </div>
      </div>
      <BrandStatusList />
    </main>
  );
}
