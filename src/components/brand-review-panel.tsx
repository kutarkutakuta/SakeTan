"use client";

import { useEffect, useState } from "react";
import { BrandReviewActions } from "./brand-review-actions";
import { errorMessage, fetchJson } from "@/lib/client";
import type { BrandReviewItem } from "@/lib/types";

export function BrandReviewPanel({
  brandId,
  pending,
  onReviewed,
}: {
  brandId: string;
  pending: boolean;
  onReviewed: () => void;
}) {
  const [brand, setBrand] = useState<BrandReviewItem | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<{ items: BrandReviewItem[]; admin: boolean }>(
      `/api/brand-statuses?id=${encodeURIComponent(brandId)}`,
      { signal: controller.signal, cache: "no-store" },
      "申請情報を取得できませんでした",
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data.admin || !data.items[0])
          throw new Error("管理者権限と銘柄の状態を確認してください");
        setBrand(data.items[0]);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(errorMessage(reason, "申請情報を取得できませんでした"));
      });
    return () => controller.abort();
  }, [brandId]);
  return (
    <section
      className="master-related-section brand-review-panel"
      aria-labelledby="brand-review-heading"
    >
      <h2 id="brand-review-heading">{pending ? "申請情報" : "銘柄を整理"}</h2>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : !brand ? (
        <p role="status">申請情報を読み込んでいます…</p>
      ) : (
        <>
          {brand.registration_status === "pending" && (
            <p>
              <strong>申請理由：</strong>
              {brand.application_reason || "記載なし"}
            </p>
          )}
          <BrandReviewActions brand={brand} onReviewed={onReviewed} />
        </>
      )}
    </section>
  );
}
