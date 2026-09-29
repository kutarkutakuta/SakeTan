// Keep the former route handlers in the browser so existing callers can keep
// their response shapes while Supabase requests go directly to its Data API.
export async function browserApi(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  if (typeof window === "undefined") return null;
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    window.location.origin,
  );
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/"))
    return null;

  const request = new Request(url, init);
  const path = url.pathname;
  if (request.method === "POST" && path === "/api/action")
    return (await import("./routes/action/route")).POST(request);
  if (request.method !== "GET")
    return Response.json({ error: "操作が見つかりません" }, { status: 405 });

  if (path === "/api/viewer")
    return (await import("./routes/viewer/route")).GET();
  if (path === "/api/brand-statuses")
    return (await import("./routes/brand-statuses/route")).GET(request);
  if (path === "/api/breweries")
    return (await import("./routes/breweries/route")).GET(request);
  if (path === "/api/explore-context")
    return (await import("./routes/explore-context/route")).GET(request);
  if (path === "/api/history")
    return (await import("./routes/history/route")).GET(request);
  if (path === "/api/search")
    return (await import("./routes/search/route")).GET(request);
  if (path === "/api/shops")
    return (await import("./routes/shops/route")).GET(request);
  if (path === "/api/shops/brand-totals")
    return (await import("./routes/shops/brand-totals/route")).GET(request);
  if (path === "/api/shops/brands")
    return (await import("./routes/shops/brands/route")).GET(request);
  if (path === "/api/shops/brands/copy-preview")
    return (await import("./routes/shops/brands/copy-preview/route")).GET(request);
  if (path === "/api/shops/comments")
    return (await import("./routes/shops/comments/route")).GET(request);
  if (path === "/api/shops/duplicates")
    return (await import("./routes/shops/duplicates/route")).GET(request);

  const match = /^\/api\/shops\/([^/]+)\/(brands|comments|comment-thread|page-data|post-data)$/.exec(path);
  if (match) {
    const context = { params: Promise.resolve({ id: decodeURIComponent(match[1]) }) };
    switch (match[2]) {
      case "brands":
        return (await import("./routes/shops/[id]/brands/route")).GET(request, context);
      case "comments":
        return (await import("./routes/shops/[id]/comments/route")).GET(request, context);
      case "comment-thread":
        return (await import("./routes/shops/[id]/comment-thread/route")).GET(request, context);
      case "page-data":
        return (await import("./routes/shops/[id]/page-data/route")).GET(request, context);
      case "post-data":
        return (await import("./routes/shops/[id]/post-data/route")).GET(request, context);
    }
  }
  return Response.json({ error: "情報が見つかりません" }, { status: 404 });
}
