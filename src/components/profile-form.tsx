"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/client";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await mutate({ kind: "profile", name });
      setSaved(true);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "表示名を変更できませんでした",
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
      {saved && <p className="quick-post-status">表示名を変更しました</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="button" type="submit" disabled={busy || !name.trim()}>
        {busy ? "保存しています…" : "表示名を保存"}
      </button>
    </form>
  );
}
