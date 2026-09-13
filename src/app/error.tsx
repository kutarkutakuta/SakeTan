"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="page narrow">
      <div className="card">
        <h1>情報を読み込めませんでした</h1>
        <p className="notice">しばらくしてから、もう一度お試しください。</p>
        <div className="actions">
          <button className="button" onClick={reset}>
            再読み込み
          </button>
          <Link className="button ghost" href="/">
            地図に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
