import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EntityDirectory } from "./entity-directory";
import { DirectoryRegistrationButton } from "./directory-registration-button";
import { directoryLabels } from "@/lib/directory-index";
import type { EntityType } from "@/lib/types";

export function DirectoryPage({ type }: { type: EntityType }) {
  const label = directoryLabels[type];
  return (
    <main id="main" className="page registration-page directory-page">
      <Link href="/" className="back">
        <ArrowLeft size={17} />
        地図に戻る
      </Link>
      <div className="page-head directory-page-head">
        <div className="directory-title-row">
          <h1>{label}一覧</h1>
          <Suspense fallback={null}>
            <DirectoryRegistrationButton type={type} />
          </Suspense>
        </div>
        <p className="directory-description">
          {type === "brand"
            ? "銘柄を探して、銘柄情報や取扱いのある酒屋を確認できます。"
            : type === "brewery"
              ? "酒蔵を探して、登録されている銘柄を確認できます。"
              : "酒屋を探して、店舗情報や取扱い銘柄を確認できます。"}
        </p>
      </div>
      <Suspense fallback={<p role="status">{label}一覧を読み込んでいます…</p>}>
        <EntityDirectory type={type} />
      </Suspense>
    </main>
  );
}
