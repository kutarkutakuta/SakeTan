"use client";

import { useState } from "react";
import { PrefectureRadioGroup } from "./prefecture-radio-group";
import { registerBrewery } from "@/lib/brewery-registration";
import { errorMessage } from "@/lib/client";
import type { Brewery } from "@/lib/types";

export function BreweryCreateFields({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (brewery: Brewery) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [nameKana, setNameKana] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const brewery = await registerBrewery({
        name,
        nameKana,
        prefecture,
        websiteUrl,
      });
      onCreated(brewery);
    } catch (reason) {
      setError(errorMessage(reason, "酒蔵を登録できませんでした"));
      setBusy(false);
    }
  }

  return (
    <fieldset
      className="brewery-create-panel form-stack"
      disabled={busy}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement &&
          event.target.type !== "radio"
        ) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <legend>新しい酒蔵を登録</legend>
      <p className="hint">登録後、この銘柄の酒蔵として選択されます。</p>
      <label>
        酒蔵名 <span className="required">必須</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={150}
          autoFocus
        />
      </label>
      <label>
        かな <span className="muted">任意</span>
        <input
          value={nameKana}
          onChange={(event) => setNameKana(event.target.value)}
          maxLength={150}
        />
      </label>
      <PrefectureRadioGroup
        name="new-brewery-prefecture"
        value={prefecture}
        onChange={setPrefecture}
      />
      <label>
        公式サイト <span className="muted">任意</span>
        <input
          type="url"
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="https://"
        />
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="button small"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          {busy ? "登録しています…" : "酒蔵を登録して選択"}
        </button>
        <button
          type="button"
          className="button small ghost"
          disabled={busy}
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </fieldset>
  );
}
