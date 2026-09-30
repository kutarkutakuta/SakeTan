import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "アカウント",
  description: "表示名、ログイン連携、貢献記録を管理できます。",
};

export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
