"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, UserRound } from "lucide-react";
import { fetchJson } from "@/lib/client";

type HeaderViewer = {
  signedIn: boolean;
  anonymous: boolean;
  name: string | null;
};

export function HeaderAuth() {
  const [viewer, setViewer] = useState<HeaderViewer | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<HeaderViewer>(
      "/api/viewer",
      { cache: "no-store", signal: controller.signal },
      "アカウント情報を取得できませんでした",
    )
      .then(setViewer)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (viewer?.signedIn)
    return (
      <Link
        className="button small ghost header-auth-link"
        href="/account"
        aria-label={viewer.name ?? "アカウント"}
      >
        <UserRound size={17} />
        <span className="account-name header-auth-label">
          {viewer.name ?? "アカウント"}
        </span>
      </Link>
    );

  const label = viewer?.anonymous ? "アカウントを保存" : "ログイン";
  return (
    <Link
      className="button small ghost header-auth-link"
      href="/login"
      aria-label={label}
    >
      <LogIn size={17} />
      <span className="header-auth-label">{label}</span>
    </Link>
  );
}
