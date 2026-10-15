import { notFound } from "next/navigation";
import { EditDetailClient } from "@/components/edit-detail-client";
import { staticDetails } from "@/lib/static-details";
import { publicMetadata } from "@/lib/seo";

export const dynamicParams = false;
export const dynamic = "error";

export function generateStaticParams() {
  return Object.keys(staticDetails().brands).map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = staticDetails().brands[id];
  if (!data) notFound();
  const name = String(data.initial.name);
  const context = [data.brewery?.name, data.brewery?.prefecture]
    .filter(Boolean)
    .join("・");
  return publicMetadata(
    `/brands/${id}`,
    `${name}${context ? `｜${context}` : ""}`,
    `${name}${context ? `（${context}）` : ""}の銘柄情報と取扱酒屋。日本酒を探せる酒屋マップ「さけのありか」。`,
  );
}

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = staticDetails().brands[id];
  if (!data) notFound();
  return <EditDetailClient type="brand" recordId={id} initialData={data} />;
}
