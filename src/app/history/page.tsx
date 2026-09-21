import { Suspense } from "react";
import { HistoryLoader } from "@/components/history-loader";

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
