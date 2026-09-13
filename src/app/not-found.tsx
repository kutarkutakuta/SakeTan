import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="page narrow">
      <div className="card">
        <h1>情報が見つかりません</h1>
        <p className="notice">URLが正しいかご確認ください。</p>
        <Link href="/" className="button">
          地図に戻る
        </Link>
      </div>
    </main>
  );
}
