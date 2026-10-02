"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, History } from "lucide-react";
import { LoginRequired } from "@/components/login-required";
import { MasterForm } from "@/components/master-form";
import { authorization, configured, supabase } from "@/lib/supabase/browser";
import type { Brewery, EntityType } from "@/lib/types";

const entities = {
  shop: { table: "shops", name: "酒屋" },
  brand: { table: "brands", name: "銘柄" },
  brewery: { table: "breweries", name: "酒蔵" },
} as const;

type DetailState = {
  initial: Record<string, unknown>;
  brewery: Brewery | null;
  signedIn: boolean;
  admin: boolean;
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
  const requestedReturnTo = params.get("return_to") ?? undefined;
  const returnTo =
    requestedReturnTo === "/brands" ||
    requestedReturnTo === "/edit" ||
    requestedReturnTo?.startsWith("/edit?")
      ? requestedReturnTo
      : undefined;
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
    let active = true;
    void (async () => {
      const [db, access] = await Promise.all([supabase(), authorization()]);
      let initial: Record<string, unknown> =
        !id && type === "brand" && requestedName ? { name: requestedName } : {};
      let brewery: Brewery | null = null;
      let found = true;
      if (id && db) {
        const fields = {
          shop: "id,name,name_kana,prefecture,city,latitude,longitude,google_place_id,geocode_source,geocode_precision,is_active",
          brand: "id,name,name_kana,brewery_id,is_active",
          brewery: "id,name,name_kana,prefecture,website_url,is_active",
        }[type];
        const { data: rawData, error: queryError } = await db
          .from(entity.table)
          .select(fields)
          .eq("id", id)
          .maybeSingle();
        if (queryError) throw new Error("登録情報を取得できませんでした");
        if (!rawData) found = false;
        else {
          initial = rawData as unknown as Record<string, unknown>;
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
          signedIn: Boolean(access.user && !access.anonymous),
          admin: access.admin,
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

  const back = shopId
    ? `/post?shop_id=${encodeURIComponent(shopId)}`
    : returnTo
      ? returnTo
      : type === "shop" && id
        ? `/shops/${id}`
        : `/edit?type=${type}`;

  return (
    <main id="main" className="page narrow">
      <a className="back" href={back}>
        <ArrowLeft size={17} />
        戻る
      </a>
      <div className="page-head">
        <h1>{id ? `${entity.name}を編集` : `新しい${entity.name}を登録`}</h1>
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
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : !state ? (
        <p className="muted">登録情報を読み込んでいます…</p>
      ) : !state.found ? (
        <p className="notice">登録情報が見つかりません</p>
      ) : (type === "brand" || type === "brewery") && !id ? (
        <div className="card">
          <h2>{entity.name}マスタは、さけのわから同期しています</h2>
          <p className="hint">
            ここから新しい{entity.name}を登録することはできません。
          </p>
        </div>
      ) : state.signedIn ? (
        <MasterForm
          type={type}
          id={id}
          initial={state.initial}
          initialBrewery={state.brewery}
          shopId={shopId}
          afterSaveHref={returnTo}
          kanaOnly={(type === "brand" || type === "brewery") && !state.admin}
        />
      ) : (
        <LoginRequired next={next} ready={configured()} />
      )}
    </main>
  );
}
