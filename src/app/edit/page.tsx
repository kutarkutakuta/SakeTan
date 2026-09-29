import { Suspense } from "react";
import { EditIndexClient } from "@/components/edit-index-client";

export default function EditIndex() {
  return (
    <Suspense fallback={<main id="main" className="page narrow" />}>
      <EditIndexClient />
    </Suspense>
  );
}
