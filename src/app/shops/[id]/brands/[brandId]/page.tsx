import { redirect } from "next/navigation";

export default async function ShopBrandPage({
  params,
}: {
  params: Promise<{ id: string; brandId: string }>;
}) {
  const { id } = await params;
  redirect(`/shops/${id}`);
}
