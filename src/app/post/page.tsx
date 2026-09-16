import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Store } from "lucide-react";
import { supabase } from "@/lib/supabase/server";
import { PostForm } from "@/components/post-form";
import { AvailabilityInfo } from "@/components/availability-info";
import type { ShopBrand } from "@/lib/types";
export default async function PostPage({
  searchParams,
}: {
  searchParams: Promise<{
    shop_id?: string;
    brand_id?: string;
  }>;
}) {
  const q = await searchParams;
  const db = await supabase();
  if (!q.shop_id)
    return (
      <main id="main" className="page narrow">
        <h1>酒屋を選んで取扱情報を変更</h1>
        <p className="notice">
          地図から酒屋を開き、「取扱状況を変更」を選んでください。
        </p>
        <Link href="/" className="button">
          地図から酒屋を探す
        </Link>
      </main>
    );
  if (!db)
    return (
      <main id="main" className="page narrow">
        <Link className="back" href={"/shops/" + q.shop_id}>
          <ArrowLeft size={17} />
          酒屋に戻る
        </Link>
        <p className="notice">
          取扱情報の変更にはSupabaseの接続設定が必要です。
        </p>
      </main>
    );
  const [shopResult, relationsResult, authResult] = await Promise.all([
    db.from("shops").select("*").eq("id", q.shop_id).maybeSingle(),
    db
      .from("shop_brands")
      .select("*,brands(*,breweries(*))")
      .eq("shop_id", q.shop_id),
    db.auth.getUser(),
  ]);
  const shop = shopResult.data;
  if (!shop) notFound();
  const relations = relationsResult.data;
  const shopRelations = ((relations ?? []) as ShopBrand[]).filter(
    (relation) => relation.brands?.is_active,
  );
  const copyAllowed = Boolean(
    authResult.data.user && !authResult.data.user.is_anonymous,
  );
  return (
    <main id="main" className="page post-page">
      <Link className="back" href={"/shops/" + q.shop_id}>
        <ArrowLeft size={17} />
        酒屋に戻る
      </Link>
      {!shop.is_active ? (
        <>
          <div className="page-head post-page-head">
            <div className="post-page-title">
              <h1>取扱銘柄の編集</h1>
              <AvailabilityInfo />
            </div>
            <Link className="post-shop" href={"/shops/" + shop.id}>
              <Store size={18} />
              <span>{shop.name}</span>
            </Link>
          </div>
          <p className="notice">この酒屋は無効化されています。</p>
        </>
      ) : (
        <PostForm
          shop={shop}
          shopRelations={shopRelations}
          copyAllowed={copyAllowed}
        />
      )}
    </main>
  );
}
