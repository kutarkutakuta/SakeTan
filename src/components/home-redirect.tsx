"use client";

import { useEffect } from "react";

export function HomeRedirect() {
  useEffect(() => {
    // Reload the static shell too, clearing any context saved from the old URL.
    window.location.replace("/");
  }, []);
  return null;
}
