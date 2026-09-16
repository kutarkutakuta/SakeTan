"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/client";
import { useToast } from "@/components/toast-provider";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await mutate({ kind: "profile", name });
      showToast("表示名を変更しました");
      router.refresh();
    } catch (reason) {
      showToast(
        reason instanceof Error
          ? reason.message
          : "表示名を変更できませんでした",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div>
        <h2>表示名</h2>
        <p className="hint">コメントや更新履歴に表示されます。</p>
      </div>
      <label>
        表示名
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={30}
          autoComplete="nickname"
        />
      </label>
      <button className="button" type="submit" disabled={busy || !name.trim()}>
        {busy ? "保存しています…" : "表示名を保存"}
      </button>
    </form>
  );
}
