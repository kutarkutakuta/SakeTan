"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { authorization } from "@/lib/supabase/browser";
import { directoryLabels, directoryPaths } from "@/lib/directory-index";
import type { EntityType } from "@/lib/types";

export function DirectoryRegistrationButton({ type }: { type: EntityType }) {
  const params = useSearchParams();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (type === "shop") return;
    let active = true;
    void authorization()
      .then((access) => {
        if (active) setAdmin(access.admin);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [type]);
  if (type !== "shop" && !admin) return null;
  const returnTo = directoryPaths[type] + (params.size ? `?${params}` : "");
  return (
    <a
      className="button small directory-registration-button"
      href={`/edit/${type}/new?${new URLSearchParams({ return_to: returnTo })}`}
    >
      <Plus size={17} aria-hidden="true" />
      {directoryLabels[type]}を登録
    </a>
  );
}
