import { Suspense } from "react";
import type { Metadata } from "next";
import { EditIndexClient } from "@/components/edit-index-client";

export const metadata: Metadata = {
  title: "登録情報を探す",
  description:
    "酒屋・銘柄・酒蔵の登録情報を検索して確認できます。編集にはログインが必要です。",
};

export default function EditIndex() {
  return (
    <Suspense fallback={<main id="main" className="page narrow" />}>
      <EditIndexClient />
    </Suspense>
  );
}
