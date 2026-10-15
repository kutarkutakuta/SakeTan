import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";

export const metadata: Metadata = {
  alternates: { canonical: "/breweries" },
  title: "酒蔵一覧",
  description:
    "酒蔵を検索し、県・かなで絞り込んで、登録されている銘柄を確認できます。",
};

export default function BreweriesPage() {
  return <DirectoryPage type="brewery" />;
}
