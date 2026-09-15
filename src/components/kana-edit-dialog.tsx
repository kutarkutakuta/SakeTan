"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { mutate } from "@/lib/client";
import type { Brand, Brewery } from "@/lib/types";

type KanaTarget = "brand" | "brewery";

export function KanaEditDialog({
  admin,
  item,
  label,
  type,
  onClose,
  onSaved,
}: {
  admin: boolean;
  item: Brand | Brewery;
  label: string;
  type: KanaTarget;
  onClose: () => void;
  onSaved: (id: string, nameKana: string | null) => void;
}) {
  const [nameKana, setNameKana] = useState(item.name_kana?.trim() ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const normalizedKana = nameKana.trim() || null;
      await mutate({
        kind: "master_kana",
        type,
        id: item.id,
        name_kana: normalizedKana,
        reason: reason.trim() || null,
      });
      onSaved(item.id, normalizedKana);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "保存できませんでした",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="quick-kana-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="quick-kana-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-kana-title"
      >
        <div className="quick-kana-handle" aria-hidden="true" />
        <div className="quick-kana-head">
          <div>
            <span className="eyebrow">{label}のかなを確認・編集</span>
            <h2 id="quick-kana-title">{item.name}</h2>
          </div>
          <button
            type="button"
            className="quick-kana-close"
            aria-label="閉じる"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form
          className="form-stack quick-kana-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="master-kana-field">
            かな <span className="muted">任意</span>
            <input
              value={nameKana}
              onChange={(event) => setNameKana(event.target.value)}
              maxLength={150}
              autoFocus
            />
            <small>
              誤りや未登録の場合だけ修正してください。空欄で保存すると未登録に戻ります。
            </small>
          </label>
          <label>
            変更理由 <span className="muted">任意</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="例：公式サイトの表記に合わせて修正"
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="quick-kana-actions">
            {admin && (
              <Link className="button ghost" href={`/edit/${type}/${item.id}`}>
                詳細編集
              </Link>
            )}
            <button disabled={busy} type="submit" className="button">
              {busy ? "保存しています…" : "かなを保存"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
