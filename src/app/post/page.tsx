import { Suspense } from "react";
import { PostPageLoader } from "@/components/post-page-loader";

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
