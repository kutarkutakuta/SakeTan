import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginPageClient } from "@/components/login-page-client";

const title = "ログイン - さけのありか";
const description = "さけのありかにログインします。";

export const metadata: Metadata = {
  title: "ログイン",
  description,
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title,
    description,
    url: "/login",
    siteName: "さけのありか",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/og-background.png",
        width: 1730,
        height: 909,
        alt: "さけのありか — 飲みたい酒から酒屋を探せる、みんなで作る酒屋マップ",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-background.png"],
  },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<main id="main" className="page narrow" />}>
      <LoginPageClient />
    </Suspense>
  );
}
