"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/client";
import { useToast } from "@/components/toast-provider";

export function BrandRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function review(status: "resolved" | "dismissed") {
    setBusy(true);
    try {
      await mutate({ kind: "brand_request_review", id, status });
      showToast(
        status === "resolved" ? "解決済みにしました" : "対応不要にしました",
      );
      router.refresh();
    } catch (reason) {
      showToast(
        reason instanceof Error
          ? reason.message
          : "確認状態を変更できませんでした",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="actions">
        <button
          className="button small"
          type="button"
          disabled={busy}
          onClick={() => void review("resolved")}
        >
          解決済みにする
        </button>
        <button
          className="button small ghost"
          type="button"
          disabled={busy}
          onClick={() => void review("dismissed")}
        >
          対応不要
        </button>
      </div>
    </div>
  );
}
