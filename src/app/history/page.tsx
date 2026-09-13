import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabase, viewer } from "@/lib/supabase/server";
import { changedFields, labels } from "@/lib/utils";
import type { History } from "@/lib/types";
import { RestoreButton } from "@/components/restore-button";
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
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string; page?: string }>;
}) {
  const q = await searchParams;
  const db = await supabase();
  const { admin } = await viewer();
  const page = Math.max(1, Math.min(10000, Math.floor(Number(q.page)) || 1));
  let histories: History[] = [];
  let count = 0;
  if (db) {
    let query = db
      .from("change_histories")
      .select("*,users(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id")
      .range((page - 1) * 30, page * 30 - 1);
    if (q.type && types[q.type]) query = query.eq("entity_type", q.type);
    if (q.id) query = query.eq("entity_id", q.id);
    const { data, error, count: c } = await query;
    if (error) throw new Error("履歴を取得できませんでした");
    histories = (data ?? []) as History[];
    count = c ?? 0;
  }
  const names = new Map<string, string>();
  if (db) {
    for (const [field, table] of [
      ["brewery_id", "breweries"],
      ["shop_id", "shops"],
      ["brand_id", "brands"],
    ]) {
      const ids = [
        ...new Set(
          histories
            .flatMap((h) => [h.before_data?.[field], h.after_data?.[field]])
            .filter((v): v is string => typeof v === "string"),
        ),
      ];
      if (ids.length) {
        const { data } = await db.from(table).select("id,name").in("id", ids);
        data?.forEach((row) => names.set(row.id, row.name));
      }
    }
  }
  const display = (v: unknown) =>
    v === null || v === undefined
      ? "未登録"
      : typeof v === "boolean"
        ? v
          ? "有効"
          : "無効"
        : (statusNames[String(v)] ?? names.get(String(v)) ?? String(v));
  const paging = (n: number) =>
    "/history?" + new URLSearchParams({ ...q, page: String(n) }).toString();
  return (
    <main id="main" className="page">
      <Link
        className="back"
        href={q.type === "shop" && q.id ? "/shops/" + q.id : "/"}
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
        {admin && (
          <Link className="button ghost small" href="/admin/brand-requests">
            見つからない銘柄
          </Link>
        )}
      </div>
      {histories.map((h) => (
        <article className="card history-entry" key={h.id}>
          <div className="history-title">
            <div>
              <strong>
                {String(h.after_data?.name ?? types[h.entity_type])}
              </strong>{" "}
              <span className="chip">{verbs[h.action]}</span>
              <div>
                <small>
                  {new Intl.DateTimeFormat("ja-JP", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Tokyo",
                  }).format(new Date(h.created_at))}{" "}
                  · {h.users?.name ?? "ユーザー"}
                </small>
              </div>
            </div>
            {h.entity_type !== "shop_brand" && (
              <Link
                className="inline-link"
                href={"/edit/" + h.entity_type + "/" + h.entity_id}
              >
                編集
              </Link>
            )}
          </div>
          {changedFields(h.before_data, h.after_data).map((key) => (
            <div key={key} className="diff">
              <strong>{labels[key]}</strong>
              <div>
                <span className="before">{display(h.before_data?.[key])}</span>
                <span aria-hidden="true"> → </span>
                <span className="after">{display(h.after_data?.[key])}</span>
              </div>
            </div>
          ))}
          {h.reason && <p className="hint">変更理由：{h.reason}</p>}
          {admin && <RestoreButton id={h.id} />}
        </article>
      ))}
      {!histories.length && (
        <div className="card empty">
          <h2>まだ更新履歴がありません</h2>
          <p>酒屋・銘柄・酒蔵の登録や編集が記録されます。</p>
        </div>
      )}
      <div className="actions">
        {page > 1 && (
          <Link className="button ghost small" href={paging(page - 1)}>
            前の30件
          </Link>
        )}
        {count > page * 30 && (
          <Link className="button ghost small" href={paging(page + 1)}>
            次の30件
          </Link>
        )}
      </div>
    </main>
  );
}
