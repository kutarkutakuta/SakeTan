"use client";
import { useState } from "react";
import { mutate } from "@/lib/client";
import { useToast } from "@/components/toast-provider";
export function RestoreButton({
  id,
  kanaOnly = false,
  onChanged,
}: {
  id: string;
  kanaOnly?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  return (
    <div style={{ marginTop: 16 }}>
      <button
        className="button ghost small"
        disabled={busy}
        onClick={async () => {
          if (
            !window.confirm(
              kanaOnly
                ? "この変更前のかなに戻しますか？ 復元操作も履歴に記録されます。"
                : "この時点の状態に戻しますか？ 復元操作も履歴に記録されます。",
            )
          )
            return;
          setBusy(true);
          try {
            await mutate({
              kind: kanaOnly ? "restore_master_kana" : "restore",
              id,
            });
            showToast(
              kanaOnly
                ? "変更前のかなに戻しました"
                : "この時点の状態に戻しました",
            );
            if (onChanged) await onChanged();
            else window.location.reload();
          } catch (e) {
            showToast(
              e instanceof Error ? e.message : "復元できませんでした",
              "error",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "復元しています…"
          : kanaOnly
            ? "変更前のかなに戻す"
            : "この時点の状態に戻す"}
      </button>
    </div>
  );
}
