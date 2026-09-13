import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Globe,
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
import { googleMapsShopUrl } from "@/lib/utils";

export default async function ShopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const available = ((relations ?? []) as ShopBrand[]).filter(
    (relation) => relation.status === "available" && relation.brands?.is_active,
  );
  const unavailable = ((relations ?? []) as ShopBrand[]).filter(
    (relation) =>
      relation.status === "unavailable" && relation.brands?.is_active,
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
  const brandSummaries = available as ShopBrandSummary[];
  const unavailableSummaries = unavailable as ShopBrandSummary[];

  return (
    <main id="main" className="page shop-page">
      <Link href="/" className="back">
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
            {shop.website_url && (
              <a
                className="text-link"
                href={shop.website_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                公式サイト <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
        <div className="actions">
          {shop.is_active && (
            <Link className="button small" href={"/post?shop_id=" + id}>
              <Plus size={17} />
              取扱銘柄を追加
            </Link>
          )}
          <Link className="button ghost small" href={"/edit/shop/" + id}>
            <Pencil size={16} />
            編集
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

      <div className="shop-content">
        <section className="card shop-brands-card">
          <h2>
            取扱銘柄 <span className="count">{available.length}</span>
          </h2>
          {available.length ? (
            <ShopBrandList items={brandSummaries} />
          ) : (
            <p className="muted">まだ取扱銘柄の登録がありません。</p>
          )}
        </section>
        {unavailable.length > 0 && (
          <section className="card shop-brands-card unavailable-brands-card">
            <h2>
              現在は取扱なし <span className="count">{unavailable.length}</span>
            </h2>
            <p className="hint availability-note">
              以前の取扱情報です。入荷状況は酒屋へご確認ください。
            </p>
            <ShopBrandList items={unavailableSummaries} />
          </section>
        )}
      </div>

      <ShopComments
        shopId={id}
        comments={(comments ?? []) as ShopComment[]}
        userId={account.anonymous ? null : (account.user?.id ?? null)}
        admin={account.admin}
        ready={configured()}
      />

      {shop.is_active && (
        <div className="sticky-post">
          <Link className="button full" href={"/post?shop_id=" + id}>
            <Plus size={20} />
            取扱状況を変更
          </Link>
        </div>
      )}
    </main>
  );
}
