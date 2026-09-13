import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BrandRequestActions } from "@/components/brand-request-actions";
import { supabase, viewer } from "@/lib/supabase/server";
import type { BrandRequest } from "@/lib/types";

export default async function BrandRequestsPage() {
  const account = await viewer();
  if (!account.admin) notFound();
  const db = await supabase();
  const { data, error } = await db!
    .from("brand_requests")
    .select("*,shops(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error("未登録銘柄の報告を取得できませんでした");
  const requests = (data ?? []) as BrandRequest[];
  return (
    <main id="main" className="page narrow">
      <Link className="back" href="/history">
        <ArrowLeft size={17} />
        更新履歴に戻る
      </Link>
      <div className="page-head">
        <div>
          <p className="eyebrow">さけのわ同期で確認する候補</p>
          <h1>見つからない銘柄</h1>
        </div>
      </div>
      {requests.map((request) => (
        <article className="card form-stack" key={request.id}>
          <div>
            <h2>{request.name}</h2>
            <p className="hint">
              {request.brewery_name ?? "酒蔵名なし"} ·{" "}
              {request.shops?.name ?? "酒屋不明"}
            </p>
          </div>
          {request.note && <p>{request.note}</p>}
          <p className="hint">
            {new Intl.DateTimeFormat("ja-JP", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Tokyo",
            }).format(new Date(request.created_at))}
          </p>
          <BrandRequestActions id={request.id} />
        </article>
      ))}
      {!requests.length && (
        <div className="card empty">
          <h2>未確認の報告はありません</h2>
        </div>
      )}
    </main>
  );
}
