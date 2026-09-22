import type { Metadata } from "next";
import "@fontsource/klee-one/400.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";
import "./globals.css";
import { Header } from "@/components/header";
import { ToastProvider } from "@/components/toast-provider";

const siteName = "さけのありか";
const siteUrl = new URL("https://xn--l8jsqp0k5g.jp/");
const title = "さけのありか｜みんなで作る酒屋マップ";
const description =
  "飲みたい酒から酒屋を探せる。近くの酒屋から酒を探せる。みんなで作る日本酒銘柄と酒販店の取扱情報。";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: siteName,
  title: {
    default: title,
    template: "%s | さけのありか",
  },
  description,
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName,
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body suppressHydrationWarning>
        <ToastProvider>
          <a href="#main" className="skip">
            本文へ移動
          </a>
          <Header />
          {children}
          <footer>
            <p className="footer-tagline">酒が見つかる。店が見つかる。</p>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
