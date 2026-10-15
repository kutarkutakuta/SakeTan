"use client";

import { useEffect, useState } from "react";

// Query parameters affect navigation/UI only, so they must not opt pages into SSR.
export function useBrowserQuery(query?: string) {
  const [search, setSearch] = useState(query ?? "");
  useEffect(() => {
    const sync = () => setSearch(query ?? window.location.search);
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [query]);
  return new URLSearchParams(search);
}
