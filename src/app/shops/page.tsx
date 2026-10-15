import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";

export const metadata: Metadata = {
  alternates: { canonical: "/shops" },
  title: "酒屋一覧",
  description:
    "酒屋を検索し、県・かなで絞り込んで、店舗情報や取扱い銘柄を確認できます。",
};

export default function ShopsPage() {
  return <DirectoryPage type="shop" />;
}
