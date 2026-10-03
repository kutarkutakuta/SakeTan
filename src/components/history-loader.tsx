"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RestoreButton } from "@/components/restore-button";
import { errorMessage, fetchJson, isAbortError } from "@/lib/client";
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
  pending: "申請中",
  approved: "登録済み",
  rejected: "却下",
  merged: "既存銘柄へ統合",
};

type HistoryData = {
  histories: History[];
  count: number;
  page: number;
  admin: boolean;
  canRestoreKana: boolean;
  names: Record<string, string>;
  error?: string;
};

function historyHeading(history: History, names: Record<string, string>) {
  if (history.entity_type !== "shop_brand")
    return String(history.after_data?.name ?? types[history.entity_type]);

  const shopId = history.after_data?.shop_id ?? history.before_data?.shop_id;
  const brandId = history.after_data?.brand_id ?? history.before_data?.brand_id;
  return `取扱関係: ${names[String(shopId)] ?? "店舗不明"} / ${names[String(brandId)] ?? "銘柄不明"}`;
}

export function HistoryLoader() {
  const router = useRouter();
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
        const result = await fetchJson<HistoryData>(
          `/api/history${query ? `?${query}` : ""}`,
          {
            cache: "no-store",
            signal,
          },
          "履歴を取得できませんでした",
        );
        setData(result);
      } catch (reason) {
        if (isAbortError(reason)) return;
        setError(errorMessage(reason, "履歴を取得できませんでした"));
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
  const shopId = searchParams.get("shop_id") ?? "";
  const actor = searchParams.get("actor") === "all" ? "all" : "non_admin";
  const changeActor = (value: "non_admin" | "all") => {
    const next = new URLSearchParams(query);
    if (value === "all") next.set("actor", value);
    else next.delete("actor");
    next.delete("page");
    const nextQuery = next.toString();
    router.push(nextQuery ? `/history?${nextQuery}` : "/history");
  };
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
      <a
        className="back"
        href={
          shopId
            ? `/shops/${shopId}`
            : type === "shop" && id
              ? `/shops/${id}`
              : "/"
        }
      >
        <ArrowLeft size={17} />
        戻る
      </a>
      <div className="page-head history-page-head">
        <h1>更新履歴</h1>
        <div className="history-head-actions">
          <label
            className="history-actor-filter"
            htmlFor="history-actor-filter"
          >
            <span className="sr-only">表示するユーザー</span>
            <select
              id="history-actor-filter"
              value={actor}
              onChange={(event) =>
                changeActor(event.target.value as "non_admin" | "all")
              }
            >
              <option value="non_admin">管理者を除く</option>
              <option value="all">全ユーザー</option>
            </select>
          </label>
          {data && (
            <span className="history-count">
              {data.count.toLocaleString("ja-JP")}件
            </span>
          )}
        </div>
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
      {data?.histories.map((history) => {
        const fields = changedFields(history.before_data, history.after_data);
        const isKanaChange =
          (history.entity_type === "brand" ||
            history.entity_type === "brewery") &&
          fields.includes("name_kana");
        return (
          <article className="card history-entry" key={history.id}>
            <div className="history-title">
              <div>
                <strong>{historyHeading(history, data.names)}</strong>{" "}
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
                <a
                  className="inline-link"
                  href={`/edit/${history.entity_type}/${history.entity_id}`}
                >
                  編集
                </a>
              )}
            </div>
            {fields.map((key) => (
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
            {history.reason && (
              <p className="hint">変更理由：{history.reason}</p>
            )}
            {isKanaChange && data.canRestoreKana ? (
              <RestoreButton id={history.id} kanaOnly onChanged={load} />
            ) : (
              data.admin && <RestoreButton id={history.id} onChanged={load} />
            )}
          </article>
        );
      })}
      {data && !data.histories.length && (
        <div className="card empty">
          <h2>条件に合う更新履歴がありません</h2>
          <p>
            {actor === "non_admin"
              ? "全ユーザーへ切り替えると、管理者による更新も表示できます。"
              : "酒屋・銘柄・酒蔵の登録や編集が記録されます。"}
          </p>
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
