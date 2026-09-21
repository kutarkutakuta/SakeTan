import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { authorization, configured, supabase } from "@/lib/supabase/server";
import { LoginRequired } from "@/components/login-required";
import { MasterForm } from "@/components/master-form";
import type { Brewery, EntityType } from "@/lib/types";
const entities = {
  shop: { table: "shops", name: "酒屋" },
  brand: { table: "brands", name: "銘柄" },
  brewery: { table: "breweries", name: "酒蔵" },
};
export default async function EditPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{
    shop_id?: string;
    name?: string;
    return_to?: string;
  }>;
}) {
  const p = await params;
  const q = await searchParams;
  if (!(p.type in entities)) notFound();
  const type = p.type as EntityType;
  const entity = entities[type];
  const id = p.id === "new" ? null : p.id;
  const returnTo =
    q.return_to === "/edit" || q.return_to?.startsWith("/edit?")
      ? q.return_to
      : undefined;
  const [db, account] = await Promise.all([supabase(), authorization()]);
  const { user, admin, anonymous } = account;
  const nextParams = new URLSearchParams();
  if (q.shop_id) nextParams.set("shop_id", q.shop_id);
  if (q.name) nextParams.set("name", q.name.slice(0, 150));
  if (returnTo) nextParams.set("return_to", returnTo);
  const next =
    "/edit/" +
    type +
    "/" +
    p.id +
    (nextParams.size ? "?" + nextParams.toString() : "");
  let initial: Record<string, unknown> =
    !id && type === "brand" && q.name ? { name: q.name.slice(0, 150) } : {};
  let brewery: Brewery | null = null;
  if (id && db) {
    const fields = {
      shop: "id,name,name_kana,prefecture,city,latitude,longitude,google_place_id,geocode_source,geocode_precision,is_active",
      brand: "id,name,name_kana,brewery_id,is_active",
      brewery: "id,name,name_kana,prefecture,website_url,is_active",
    }[type];
    const { data: rawData, error } = await db
      .from(entity.table)
      .select(fields)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("登録情報を取得できませんでした");
    if (!rawData) notFound();
    const data = rawData as unknown as Record<string, unknown>;
    initial = data;
    if (type === "brand" && typeof data.brewery_id === "string") {
      const { data: b } = await db
        .from("breweries")
        .select("id,name,name_kana,prefecture,website_url,is_active")
        .eq("id", data.brewery_id)
        .maybeSingle();
      brewery = b;
    }
  }
  return (
    <main id="main" className="page narrow">
      <Link
        className="back"
        href={
          q.shop_id
            ? "/post?shop_id=" + q.shop_id
            : returnTo
              ? returnTo
              : type === "shop" && id
                ? "/shops/" + id
                : "/"
        }
      >
        <ArrowLeft size={17} />
        戻る
      </Link>
      <div className="page-head">
        <h1>
          {id ? entity.name + "を編集" : "新しい" + entity.name + "を登録"}
        </h1>
        {id && (
          <Link
            className="button ghost small"
            href={"/history?type=" + type + "&id=" + id}
          >
            <History size={16} />
            更新履歴
          </Link>
        )}
      </div>
      {(type === "brand" || type === "brewery") && !id ? (
        <div className="card">
          <h2>{entity.name}マスタは、さけのわから同期しています</h2>
          <p className="hint">
            ここから新しい{entity.name}を登録することはできません。
          </p>
        </div>
      ) : db &&
        ((type === "shop" && user && !anonymous) ||
          ((type === "brand" || type === "brewery") && user && !anonymous)) ? (
        <MasterForm
          type={type}
          id={id}
          initial={initial}
          initialBrewery={brewery}
          shopId={q.shop_id}
          afterSaveHref={returnTo}
          kanaOnly={(type === "brand" || type === "brewery") && !admin}
        />
      ) : (
        <LoginRequired next={next} ready={configured()} />
      )}
    </main>
  );
}
