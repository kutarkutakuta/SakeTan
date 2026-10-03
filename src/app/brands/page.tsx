import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { BrandStatusList } from "@/components/brand-status-list";

export const metadata: Metadata = {
  title: "銘柄の状態",
  description: "日本酒銘柄の登録状況と、取扱店舗を確認できます。",
};

export default function BrandStatusesPage() {
  return (
    <main id="main" className="page registration-page">
      <Link href="/" className="back">
        <ArrowLeft size={17} />
        地図に戻る
      </Link>
      <div className="page-head">
        <div>
          <h1>銘柄の状態</h1>
        </div>
      </div>
      <BrandStatusList />
    </main>
  );
}
