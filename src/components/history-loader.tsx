"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RestoreButton } from "@/components/restore-button";
import type { History } from "@/lib/types";
import { changedFields, labels } from "@/lib/utils";

const types: Record<string, string> = {
  shop: "酒屋",
  brand: "銘柄",
  brewery: "酒蔵",
  shop_brand: "取扱関係",
};
const verbs: Record<string, string> = {
  create: "登録",
  update: "更新",
  deactivate: "無効化",
  restore: "復元",
};
const statusNames: Record<string, string> = {
  available: "取扱あり",
  unavailable: "現在は取扱なし",
  incorrect: "誤った取扱情報",
};

type HistoryData = {
  histories: History[];
  count: number;
  page: number;
  admin: boolean;
  names: Record<string, string>;
  error?: string;
};

export function HistoryLoader() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/history${query ? `?${query}` : ""}`,
          {
            cache: "no-store",
            signal,
          },
        );
        const result = (await response.json()) as HistoryData;
        if (!response.ok)
          throw new Error(result.error ?? "履歴を取得できませんでした");
        setData(result);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : "履歴を取得できませんでした",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const type = searchParams.get("type") ?? "";
  const id = searchParams.get("id") ?? "";
  const paging = (page: number) => {
    const next = new URLSearchParams(query);
    next.set("page", String(page));
    return `/history?${next.toString()}`;
  };
  const display = (value: unknown) =>
    value === null || value === undefined
      ? "未登録"
      : typeof value === "boolean"
        ? value
          ? "有効"
          : "無効"
        : (statusNames[String(value)] ??
          data?.names[String(value)] ??
          String(value));

  return (
    <main id="main" className="page">
      <Link
        className="back"
        href={type === "shop" && id ? `/shops/${id}` : "/"}
      >
        <ArrowLeft size={17} />
        戻る
      </Link>
      <div className="page-head">
        <div>
          <p className="eyebrow">みんなで育てる、酒屋と日本酒の情報。</p>
          <h1>更新履歴</h1>
        </div>
        <Link className="button ghost small" href="/edit">
          登録情報を探して編集
        </Link>
        {data?.admin && (
          <Link className="button ghost small" href="/admin/brand-requests">
            見つからない銘柄
          </Link>
        )}
      </div>
      {loading && !data && <p className="muted">更新履歴を読み込んでいます…</p>}
      {error && !data && (
        <div className="card empty">
          <p className="notice">{error}</p>
          <button
            className="button small"
            type="button"
            onClick={() => void load()}
          >
            再読み込み
          </button>
        </div>
      )}
      {data?.histories.map((history) => (
        <article className="card history-entry" key={history.id}>
          <div className="history-title">
            <div>
              <strong>
                {String(history.after_data?.name ?? types[history.entity_type])}
              </strong>{" "}
              <span className="chip">{verbs[history.action]}</span>
              <div>
                <small>
                  {new Intl.DateTimeFormat("ja-JP", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Tokyo",
                  }).format(new Date(history.created_at))}{" "}
                  · {history.users?.name ?? "ユーザー"}
                </small>
              </div>
            </div>
            {history.entity_type !== "shop_brand" && (
              <Link
                className="inline-link"
                href={`/edit/${history.entity_type}/${history.entity_id}`}
              >
                編集
              </Link>
            )}
          </div>
          {changedFields(history.before_data, history.after_data).map((key) => (
            <div key={key} className="diff">
              <strong>{labels[key]}</strong>
              <div>
                <span className="before">
                  {display(history.before_data?.[key])}
                </span>
                <span aria-hidden="true"> → </span>
                <span className="after">
                  {display(history.after_data?.[key])}
                </span>
              </div>
            </div>
          ))}
          {history.reason && <p className="hint">変更理由：{history.reason}</p>}
          {data.admin && <RestoreButton id={history.id} onChanged={load} />}
        </article>
      ))}
      {data && !data.histories.length && (
        <div className="card empty">
          <h2>まだ更新履歴がありません</h2>
          <p>酒屋・銘柄・酒蔵の登録や編集が記録されます。</p>
        </div>
      )}
      {data && (
        <div className="actions">
          {data.page > 1 && (
            <Link className="button ghost small" href={paging(data.page - 1)}>
              前の30件
            </Link>
          )}
          {data.count > data.page * 30 && (
            <Link className="button ghost small" href={paging(data.page + 1)}>
              次の30件
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
