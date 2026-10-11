import type { Metadata } from "next";
import { EditDetailClient } from "@/components/edit-detail-client";

export const metadata: Metadata = {
  title: "銘柄情報",
  description: "日本酒銘柄の情報と取扱酒屋を確認できます。",
};

export default async function BrandDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["shop_id", "name", "return_to"]) {
    const value = values[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  return <EditDetailClient type="brand" recordId={id} query={query.toString()} />;
}
