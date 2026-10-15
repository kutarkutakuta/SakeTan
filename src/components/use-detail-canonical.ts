"use client";

import { useEffect } from "react";
import { siteUrl } from "@/lib/seo";

export function useDetailCanonical(path: string | null) {
  useEffect(() => {
    if (!path) return;
    const previous = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const link = previous ?? document.createElement("link");
    const oldHref = previous?.getAttribute("href");
    link.rel = "canonical";
    link.href = new URL(path, siteUrl).href;
    if (!previous) document.head.appendChild(link);
    return () => {
      if (oldHref != null) link.setAttribute("href", oldHref);
      else link.remove();
    };
  }, [path]);
}
