import type { Metadata } from "next";
import { EditDetailClient } from "@/components/edit-detail-client";

export const metadata: Metadata = {
  title: "酒蔵情報",
  description: "酒蔵の情報と所属する銘柄を確認できます。",
};

export default async function BreweryDetailPage({
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
  return (
    <EditDetailClient type="brewery" recordId={id} query={query.toString()} />
  );
}
