import { notFound } from "next/navigation";
import { ShopPageLoader } from "@/components/shop-page-loader";
import { staticDetails } from "@/lib/static-details";
import { publicMetadata } from "@/lib/seo";

export const dynamicParams = false;
export const dynamic = "error";

export function generateStaticParams() {
  return Object.keys(staticDetails().shops).map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = staticDetails().shops[id];
  if (!data) notFound();
  const location = [data.shop.prefecture, data.shop.city]
    .filter(Boolean)
    .join(" ");
  return publicMetadata(
    `/shops/${id}`,
    `${data.shop.name}${location ? `｜${location}` : ""}`,
    `${data.shop.name}${location ? `（${location}）` : ""}の取扱銘柄と店舗情報。日本酒を探せる酒屋マップ「さけのありか」。`,
  );
}

export default async function ShopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = staticDetails().shops[id];
  if (!data) notFound();
  return <ShopPageLoader shopId={id} initialData={data} />;
}
