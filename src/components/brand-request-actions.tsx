"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/client";

export function BrandRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function review(status: "resolved" | "dismissed") {
    setBusy(true);
    setError("");
    try {
      await mutate({ kind: "brand_request_review", id, status });
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "確認状態を変更できませんでした",
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
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
