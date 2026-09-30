import { Suspense } from "react";
import type { Metadata } from "next";
import { PostPageLoader } from "@/components/post-page-loader";

export const metadata: Metadata = {
  title: "取扱銘柄の編集",
  description: "酒屋の取扱銘柄と取扱状況を登録・更新できます。",
};

export default function PostPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="page post-page">
          <p className="muted">取扱情報を読み込んでいます…</p>
        </main>
      }
    >
      <PostPageLoader />
    </Suspense>
  );
}
