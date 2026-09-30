import { Suspense } from "react";
import type { Metadata } from "next";
import { HistoryLoader } from "@/components/history-loader";

export const metadata: Metadata = {
  title: "更新履歴",
  description: "酒屋・銘柄・酒蔵の登録情報に関する更新履歴を確認できます。",
};

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="page">
          <p className="muted">更新履歴を読み込んでいます…</p>
        </main>
      }
    >
      <HistoryLoader />
    </Suspense>
  );
}
