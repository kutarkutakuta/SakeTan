import { notFound } from "next/navigation";
import { EditDetailClient } from "@/components/edit-detail-client";
import { staticDetails } from "@/lib/static-details";
import { publicMetadata } from "@/lib/seo";

export const dynamicParams = false;
export const dynamic = "error";

export function generateStaticParams() {
  return Object.keys(staticDetails().breweries).map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = staticDetails().breweries[id];
  if (!data) notFound();
  const name = String(data.initial.name);
  const location = data.initial.prefecture as string | null;
  return publicMetadata(
    `/breweries/${id}`,
    `${name}${location ? `｜${location}` : ""}`,
    `${name}${location ? `（${location}）` : ""}の酒蔵情報と日本酒銘柄。日本酒を探せる酒屋マップ「さけのありか」。`,
  );
}

export default async function BreweryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = staticDetails().breweries[id];
  if (!data) notFound();
  return <EditDetailClient type="brewery" recordId={id} initialData={data} />;
}
