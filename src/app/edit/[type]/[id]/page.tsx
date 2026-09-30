import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EditDetailClient } from "@/components/edit-detail-client";
import type { EntityType } from "@/lib/types";

const types: EntityType[] = ["shop", "brand", "brewery"];

export const metadata: Metadata = {
  title: "登録情報を編集",
};

export default async function EditPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const route = await params;
  if (!types.includes(route.type as EntityType)) notFound();
  const query = new URLSearchParams();
  const values = await searchParams;
  for (const key of ["shop_id", "name", "return_to"])
    if (values[key]) query.set(key, values[key]);
  return (
    <EditDetailClient
      type={route.type as EntityType}
      recordId={route.id}
      query={query.toString()}
    />
  );
}
