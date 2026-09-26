"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, fetchJson, isAbortError } from "@/lib/client";
import type { ShopCommentThread } from "@/lib/types";
import { ShopComments } from "./shop-comments";

export function ShopCommentsLoader({
  shopId,
  onCountChange,
}: {
  shopId: string;
  onCountChange: (count: number) => void;
}) {
  const [thread, setThread] = useState<ShopCommentThread | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchJson<ShopCommentThread>(
          `/api/shops/${shopId}/comment-thread`,
          { cache: "no-store", signal },
          "コメントを取得できませんでした",
        );
        setThread(result);
        onCountChange(result.comments.length);
      } catch (reason) {
        if (isAbortError(reason)) return;
        setError(errorMessage(reason, "コメントを取得できませんでした"));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [onCountChange, shopId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading && !thread)
    return (
      <section id="comments" className="comments-section">
        <h2>コメント</h2>
        <p className="muted">コメントを読み込んでいます…</p>
      </section>
    );

  if (error && !thread)
    return (
      <section id="comments" className="comments-section">
        <h2>コメント</h2>
        <p className="notice">{error}</p>
        <button
          className="button small"
          type="button"
          onClick={() => void load()}
        >
          再読み込み
        </button>
      </section>
    );

  if (!thread) return null;

  return (
    <ShopComments
      shopId={shopId}
      comments={thread.comments}
      userId={thread.userId}
      admin={thread.admin}
      ready={thread.ready}
      onChanged={() => load()}
    />
  );
}
