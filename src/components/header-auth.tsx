"use client";

import Link from "next/link";
import { LogIn, UserRound } from "lucide-react";

export type HeaderViewer = {
  signedIn: boolean;
  anonymous: boolean;
  name: string | null;
};

export function HeaderAuth({
  viewer,
}: {
  viewer: HeaderViewer | null | undefined;
}) {
  // Undefined is pending; null is a failed lookup, not a signed-out viewer.
  if (viewer === undefined)
    return (
      <span
        className="button small ghost header-auth-link header-auth-pending"
        role="status"
        aria-label="アカウント情報を確認中"
        aria-busy="true"
      >
        <UserRound size={17} aria-hidden="true" />
        <span
          className="header-auth-label header-auth-placeholder"
          aria-hidden="true"
        />
      </span>
    );

  if (viewer === null || viewer.signedIn)
    return (
      <Link
        className="button small ghost header-auth-link"
        href="/account"
        prefetch={false}
        aria-label={viewer?.name ?? "アカウント"}
      >
        <UserRound size={17} />
        <span className="account-name header-auth-label">
          {viewer?.name ?? "アカウント"}
        </span>
      </Link>
    );

  const label = viewer.anonymous ? "アカウントを保存" : "ログイン";
  return (
    <Link
      className="button small ghost header-auth-link"
      href="/login"
      prefetch={false}
      aria-label={label}
    >
      <LogIn size={17} />
      <span className="header-auth-label">{label}</span>
    </Link>
  );
}
