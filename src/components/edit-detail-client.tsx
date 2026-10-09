"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, History } from "lucide-react";
import { z } from "zod";
import { HomeRedirect } from "@/components/home-redirect";
import { BrandShopList } from "@/components/brand-shop-list";
import { LoginRequired } from "@/components/login-required";
import { MasterForm } from "@/components/master-form";
import { sortBrands } from "@/lib/brand-index";
import { masterDetailHref, masterReturnPath } from "@/lib/master-navigation";
import { authorization, configured, supabase } from "@/lib/supabase/browser";
import type { Brand, Brewery, EntityType } from "@/lib/types";

const entities = {
  shop: { table: "shops", name: "酒屋" },
  brand: { table: "brands", name: "銘柄" },
  brewery: { table: "breweries", name: "酒蔵" },
} as const;

type DetailState = {
  initial: Record<string, unknown>;
  brewery: Brewery | null;
  brands: Brand[];
  signedIn: boolean;
  admin: boolean;
  canDeactivate: boolean;
  found: boolean;
};

export function EditDetailClient({
  type,
  recordId,
  query,
}: {
  type: EntityType;
  recordId: string;
  query: string;
}) {
  const params = new URLSearchParams(query);
  const shopId = params.get("shop_id") ?? undefined;
  const requestedName = params.get("name")?.slice(0, 150) ?? "";
  const returnTo = masterReturnPath(params.get("return_to"));
  const id = recordId === "new" ? null : recordId;
  const entity = entities[type];
  const nextParams = new URLSearchParams();
  if (shopId) nextParams.set("shop_id", shopId);
  if (requestedName) nextParams.set("name", requestedName);
  if (returnTo) nextParams.set("return_to", returnTo);
  const next =
    `/edit/${type}/${recordId}` +
    (nextParams.size ? `?${nextParams.toString()}` : "");
  const [state, setState] = useState<DetailState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id && !z.uuid().safeParse(id).success) return;
    let active = true;
    void (async () => {
      const [db, access] = await Promise.all([supabase(), authorization()]);
      let initial: Record<string, unknown> =
        !id && type === "brand" && requestedName ? { name: requestedName } : {};
      let brewery: Brewery | null = null;
      let brands: Brand[] = [];
      let found = true;
      let canDeactivate = type !== "shop" || access.admin;
      if (id && db) {
        const fields = {
          shop: "id,name,name_kana,prefecture,city,latitude,longitude,google_place_id,geocode_source,geocode_precision,is_active,created_by",
          brand: "id,name,name_kana,brewery_id,is_active",
          brewery:
            "id,name,name_kana,prefecture,website_url,is_active,brands(id,name,name_kana,brewery_id,registration_status)",
        }[type];
        let request = db.from(entity.table).select(fields).eq("id", id);
        if (type === "brewery") {
          request = request
            .eq("brands.is_active", true)
            .in("brands.registration_status", ["pending", "approved"]);
        }
        const { data: rawData, error: queryError } =
          await request.maybeSingle();
        if (queryError) throw new Error("登録情報を取得できませんでした");
        if (!rawData) found = false;
        else {
          initial = rawData as unknown as Record<string, unknown>;
          if (type === "brewery") {
            const { brands: relatedBrands, ...record } = initial;
            initial = record;
            brands = sortBrands((relatedBrands ?? []) as Brand[], "brand");
          }
          if (type === "shop") {
            canDeactivate =
              access.admin ||
              access.user?.id === (initial.created_by as string | null);
          }
          if (type === "brand" && typeof initial.brewery_id === "string") {
            const { data } = await db
              .from("breweries")
              .select("id,name,name_kana,prefecture,website_url,is_active")
              .eq("id", initial.brewery_id)
              .maybeSingle();
            brewery = data;
          }
        }
      }
      if (active)
        setState({
          initial,
          brewery,
          brands,
          signedIn: Boolean(access.user && !access.anonymous),
          admin: access.admin,
          canDeactivate,
          found,
        });
    })().catch((reason) => {
      if (active)
        setError(
          reason instanceof Error
            ? reason.message
            : "登録情報を取得できませんでした",
        );
    });
    return () => {
      active = false;
    };
  }, [entity.table, id, requestedName, type]);

  const publicRecord =
    id && state?.found && !error && type !== "shop" ? state.initial : null;
  const recordName =
    typeof publicRecord?.name === "string" ? publicRecord.name.trim() : "";
  const recordKana =
    typeof publicRecord?.name_kana === "string"
      ? publicRecord.name_kana.trim()
      : "";
  const recordBrewery = type === "brand" ? state?.brewery : null;
  const recordPrefecture =
    type === "brand"
      ? (recordBrewery?.prefecture?.trim() ?? "")
      : typeof publicRecord?.prefecture === "string"
        ? publicRecord.prefecture.trim()
        : "";
  const titleContext = [recordBrewery?.name?.trim(), recordPrefecture]
    .filter(Boolean)
    .join("・");
  const publicTitle = recordName
    ? `${recordName}${titleContext ? `｜${titleContext}` : ""} - さけのありか`
    : "";

  useEffect(() => {
    if (!publicTitle) return;
    const previousTitle = document.title;
    document.title = publicTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [publicTitle]);

  const back = shopId
    ? `/post?shop_id=${encodeURIComponent(shopId)}`
    : returnTo
      ? returnTo
      : type === "shop" && id
        ? `/shops/${id}`
        : `/edit?type=${type}`;

  if ((id && !z.uuid().safeParse(id).success) || (state && !state.found))
    return <HomeRedirect />;

  return (
    <main id="main" className="page narrow">
      <a className="back" href={back}>
        <ArrowLeft size={17} />
        戻る
      </a>
      <div className="page-head master-detail-head">
        <div>
          <h1 className={recordName ? "shop-title" : undefined}>
            {recordName ? (
              <>
                <span>{recordName}</span>
                {recordKana && (
                  <span className="shop-title-kana">{recordKana}</span>
                )}
              </>
            ) : id ? (
              `${entity.name}を編集`
            ) : (
              `新しい${entity.name}を登録`
            )}
          </h1>
          {recordName && (type === "brand" || recordPrefecture) && (
            <p className="shop-location master-detail-location">
              {type === "brand" ? (
                recordBrewery ? (
                  <a href={masterDetailHref("brewery", recordBrewery.id, next)}>
                    {recordBrewery.name}
                    {recordPrefecture && `（${recordPrefecture}）`}
                  </a>
                ) : (
                  "酒蔵未登録"
                )
              ) : (
                recordPrefecture
              )}
            </p>
          )}
        </div>
        {id && (
          <a
            className="button ghost small"
            href={`/history?type=${type}&id=${id}`}
          >
            <History size={16} />
            更新履歴
          </a>
        )}
      </div>
      {recordName && publicRecord?.is_active === false && (
        <p className="notice">この{entity.name}は無効化されています。</p>
      )}
      {recordName && type === "brewery" && state && (
        <section
          className="master-related-section"
          aria-labelledby="brewery-brands-heading"
        >
          <h2 id="brewery-brands-heading">この酒蔵の銘柄</h2>
          {state.brands.length ? (
            <ul className="brewery-brand-list">
              {state.brands.map((brand) => (
                <li key={brand.id}>
                  <a href={masterDetailHref("brand", brand.id, next)}>
                    <span>
                      {brand.name}
                      {brand.name_kana && (
                        <span className="brewery-brand-kana">
                          （{brand.name_kana}）
                        </span>
                      )}
                    </span>
                    {brand.registration_status === "pending" && (
                      <span className="brewery-brand-pending">申請中</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">登録されている銘柄はありません。</p>
          )}
        </section>
      )}
      {recordName && type === "brand" && id && (
        <BrandShopList key={id} brandId={id} />
      )}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : !state ? (
        <p className="muted">登録情報を読み込んでいます…</p>
      ) : (type === "brand" || type === "brewery") && !id && !state.admin ? (
        <div className="card">
          <h2>{entity.name}マスタは管理者が管理しています</h2>
          <p className="hint">
            新しい{entity.name}の登録は管理者のみ行えます。
          </p>
        </div>
      ) : state.signedIn ? (
        <>
          {recordName && (
            <h2 className="master-edit-heading">{entity.name}を編集</h2>
          )}
          <MasterForm
            type={type}
            id={id}
            initial={state.initial}
            initialBrewery={state.brewery}
            shopId={shopId}
            afterSaveHref={returnTo}
            breweryReturnTo={type === "brand" ? next : undefined}
            kanaOnly={(type === "brand" || type === "brewery") && !state.admin}
            canDeactivate={state.canDeactivate}
            admin={state.admin}
          />
        </>
      ) : (
        <LoginRequired next={next} ready={configured()} />
      )}
    </main>
  );
}
