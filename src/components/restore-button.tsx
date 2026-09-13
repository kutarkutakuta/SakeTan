"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/client";
export function RestoreButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div style={{ marginTop: 16 }}>
      <button
        className="button ghost small"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              "この時点の状態に戻しますか？ 復元操作も履歴に記録されます。",
            )
          )
            return;
          setBusy(true);
          try {
            await mutate({ kind: "restore", id });
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "復元できませんでした");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "復元しています…" : "この時点の状態に戻す"}
      </button>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
