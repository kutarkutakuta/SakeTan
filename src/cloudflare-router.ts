// Static assets bypass this Worker. Only URL-shaped app pages and auth handlers
// reach it, keeping Next's server runtime out of ordinary page navigation.
type Assets = { fetch(request: Request): Promise<Response> };
type Env = { ASSETS: Assets } & Record<string, unknown>;

export default {
  async fetch(request: Request, env: Env, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/auth/")) {
      // @ts-ignore OpenNext generates this module after Next's type check.
      const { default: nextWorker } = await import("../.open-next/worker.js");
      return nextWorker.fetch(request, env, ctx);
    }

    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405 });
    if (url.pathname.startsWith("/api/"))
      return Response.json(
        { error: "ページを再読み込みしてください" },
        { status: 410, headers: { "Cache-Control": "no-store" } },
      );

    const legacyBrand = /^\/shops\/([^/]+)\/brands\/[^/]+\/?$/.exec(
      url.pathname,
    );
    if (legacyBrand)
      return Response.redirect(new URL(`/shops/${legacyBrand[1]}`, url), 308);
    if (url.pathname === "/admin/brand-requests")
      return Response.redirect(new URL("/brands", url), 308);

    if (
      /^\/shops\/[^/]+\/?$/.test(url.pathname) ||
      /^\/edit\/(shop|brand|brewery)\/[^/]+\/?$/.test(url.pathname)
    ) {
      const shell = new URL("/", url);
      return env.ASSETS.fetch(new Request(shell, request));
    }
    return new Response("Not Found", { status: 404 });
  },
};
