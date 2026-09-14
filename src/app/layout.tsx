import type { Metadata } from "next";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";
import "./globals.css";
import { Header } from "@/components/header";
export const metadata: Metadata = {
  title: {
    default: "さけたん｜酒と酒屋をつなぐ地図",
    template: "%s | さけたん",
  },
  description:
    "飲みたい酒から店を探せる。近くの店から酒を探せる。ユーザーの発見で育つ、日本酒銘柄と酒屋の取扱情報。",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body suppressHydrationWarning>
        <a href="#main" className="skip">
          本文へ移動
        </a>
        <Header />
        {children}
        <footer>
          <p className="footer-tagline">酒が見つかる。店が見つかる。</p>
          <a
            className="footer-source"
            href="https://sakenowa.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            さけのわデータを利用しています ↗
          </a>
        </footer>
      </body>
    </html>
  );
}
