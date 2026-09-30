import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginPageClient } from "@/components/login-page-client";

export const metadata: Metadata = {
  title: "ログイン",
  description: "さけのありかにログインします。",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<main id="main" className="page narrow" />}>
      <LoginPageClient />
    </Suspense>
  );
}
