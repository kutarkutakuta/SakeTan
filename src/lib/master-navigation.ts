import { z } from "zod";

export function masterReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020]/u.test(value))
    return undefined;
  const pathname = value.split(/[?#]/u, 1)[0];
  if (pathname === "/brands" || pathname === "/edit") return value;
  if (pathname === "/post") {
    const shopId = new URL(value, "https://example.test").searchParams.get(
      "shop_id",
    );
    return z.uuid().safeParse(shopId).success ? value : undefined;
  }
  const detail = /^\/(?:edit\/(?:brand|brewery|shop)|shops)\/([^/]+)$/u.exec(
    pathname,
  );
  return detail && z.uuid().safeParse(detail[1]).success ? value : undefined;
}

export function masterDetailHref(
  type: "brand" | "brewery",
  id: string,
  returnTo: string,
) {
  return `/edit/${type}/${id}?${new URLSearchParams({ return_to: returnTo })}`;
}
