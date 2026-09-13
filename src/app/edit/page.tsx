import Link from "next/link";
import { EditSearch } from "@/components/edit-search";
import { viewer } from "@/lib/supabase/server";
export default async function EditIndex() {
  const { admin } = await viewer();
  return (
    <main id="main" className="page narrow">
      <Link href="/" className="back">
        ← 地図に戻る
      </Link>
      <div className="page-head">
        <h1>登録情報を編集</h1>
        <Link href="/history" className="inline-link">
          更新履歴
        </Link>
      </div>
      <EditSearch admin={admin} />
    </main>
  );
}
