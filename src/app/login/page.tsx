import { Suspense } from "react";
import { LoginPageClient } from "@/components/login-page-client";

export default function LoginPage() {
  return (
    <Suspense fallback={<main id="main" className="page narrow" />}>
      <LoginPageClient />
    </Suspense>
  );
}
