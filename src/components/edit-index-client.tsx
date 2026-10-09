"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EditSearch } from "@/components/edit-search";
import { authorization } from "@/lib/supabase/browser";
import type { EntityType } from "@/lib/types";

const entityTypes: EntityType[] = ["brand", "brewery", "shop"];

export function EditIndexClient() {
  const params = useSearchParams();
  const target = params.get("type");
  const initialTarget = entityTypes.includes(target as EntityType)
    ? (target as EntityType)
    : "brand";
  const initialQuery = params.get("q")?.slice(0, 150) ?? "";
  const [access, setAccess] = useState({ admin: false, signedIn: false });

  useEffect(() => {
    let active = true;
    void authorization()
      .then(({ user, admin, anonymous }) => {
        if (active) setAccess({ admin, signedIn: Boolean(user && !anonymous) });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <main id="main" className="page narrow">
      <a href="/" className="back">
        ← 地図に戻る
      </a>
      <div className="page-head">
        <h1>登録情報を探す</h1>
        {access.admin && (
          <div className="edit-admin-actions" aria-label="マスター登録">
            <a className="button small ghost" href="/edit/brewery/new">
              酒蔵を登録
            </a>
            <a className="button small" href="/edit/brand/new">
              銘柄を登録
            </a>
          </div>
        )}
      </div>
      <EditSearch
        admin={access.admin}
        signedIn={access.signedIn}
        initialTarget={initialTarget}
        initialQuery={initialQuery}
      />
    </main>
  );
}
