import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";

export const metadata: Metadata = {
  title: "銘柄一覧",
  description:
    "日本酒の銘柄を検索し、県・かな・登録状態で絞り込めます。銘柄情報や取扱店舗を確認できます。",
};

export default function BrandsPage() {
  return <DirectoryPage type="brand" />;
}
