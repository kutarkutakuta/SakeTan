import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Plus,
  Pencil,
  History,
  ExternalLink,
} from "lucide-react";
import { configured, supabase, viewer } from "@/lib/supabase/server";
import type { Shop, ShopBrand, ShopComment } from "@/lib/types";
import type { ShopBrandSummary } from "@/lib/brand-index";
import { ShopBrandList } from "@/components/shop-brand-list";
import { ShopComments } from "@/components/shop-comments";
import { ShopPageTabs } from "@/components/shop-page-tabs";
import { googleMapsShopUrl } from "@/lib/utils";
import { safeMapReturnPath } from "@/lib/map-view";

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return_to?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { return_to: returnTo, tab } = await searchParams;
  const db = await supabase();
  if (!db)
    return (
      <main id="main" className="page">
        <p className="notice">酒屋を表示するには接続設定が必要です。</p>
        <Link href="/">地図に戻る</Link>
      </main>
    );

  const { data, error } = await db
    .from("shops")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("酒屋情報を読み込めませんでした");
  if (!data) notFound();
  const shop = data as Shop;
  const googleMapsUrl = googleMapsShopUrl(shop);

  const { data: relations, error: relationError } = await db
    .from("shop_brands")
    .select("*,brands(*,breweries(*))")
    .eq("shop_id", id);
  if (relationError) throw new Error("取扱情報を読み込めませんでした");
  const listedBrands = ((relations ?? []) as ShopBrand[]).filter(
    (relation) =>
      (relation.status === "available" || relation.status === "unavailable") &&
      relation.brands?.is_active,
  );

  const [{ data: comments, error: commentError }, account] = await Promise.all([
    db
      .from("shop_comments")
      .select("*,users(name)")
      .eq("shop_id", id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false }),
    viewer(),
  ]);
  if (commentError) throw new Error("コメントを読み込めませんでした");
  const brandSummaries = listedBrands as ShopBrandSummary[];

  return (
    <main id="main" className="page shop-page">
      <Link href={safeMapReturnPath(returnTo, id)} className="back">
        <ArrowLeft size={17} />
        地図に戻る
      </Link>
      <div className="page-head shop-head">
        <div>
          <h1>{shop.name}</h1>
          <div className="shop-links">
            <a
              className="text-link"
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              営業時間等をGoogle マップで確認
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <div className="actions">
          {shop.is_active && (
            <Link
              className="button small shop-head-brand-edit"
              href={"/post?shop_id=" + id}
            >
              <Plus size={17} />
              取扱銘柄の編集
            </Link>
          )}
          <Link className="button ghost small" href={"/edit/shop/" + id}>
            <Pencil size={16} />
            店舗の編集
          </Link>
          <Link
            className="button ghost small"
            href={"/history?type=shop&id=" + id}
          >
            <History size={16} />
            更新履歴
          </Link>
        </div>
      </div>
      {!shop.is_active && (
        <p className="notice">この酒屋は無効化されています。</p>
      )}

      <ShopPageTabs
        initialTab={tab === "comments" ? "comments" : "brands"}
        brandCount={listedBrands.length}
        commentCount={comments?.length ?? 0}
        brands={
          <div className="shop-content">
            <section className="card shop-brands-card">
              {listedBrands.length ? (
                <ShopBrandList items={brandSummaries} title="取扱銘柄" />
              ) : (
                <>
                  <div className="shop-brands-heading">
                    <h2>取扱銘柄</h2>
                    <span className="brand-filter-count">0件</span>
                  </div>
                  <p className="muted">まだ取扱銘柄の登録がありません。</p>
                </>
              )}
            </section>
          </div>
        }
        comments={
          <ShopComments
            shopId={id}
            comments={(comments ?? []) as ShopComment[]}
            userId={account.anonymous ? null : (account.user?.id ?? null)}
            admin={account.admin}
            ready={configured()}
          />
        }
      />

      {shop.is_active && (
        <div className="sticky-post">
          <Link className="button full" href={"/post?shop_id=" + id}>
            <Plus size={20} />
            取扱銘柄の編集
          </Link>
        </div>
      )}
    </main>
  );
}
