import assert from "node:assert/strict";
import test from "node:test";
import router from "../src/cloudflare-router";

test("ID pages serve the static shell while missing pages redirect home", async () => {
  const fetched: string[] = [];
  const env = {
    ASSETS: {
      fetch: async (request: Request) => {
        fetched.push(new URL(request.url).pathname);
        return new Response("static shell");
      },
    },
  };

  for (const path of [
    "/shops/shop-id",
    "/edit/shop/new",
    "/edit/brand/brand-id",
  ]) {
    const response = await router.fetch(
      new Request(`https://example.com${path}`),
      env,
      undefined,
    );
    assert.equal(await response.text(), "static shell");
  }
  assert.deepEqual(fetched, ["/", "/", "/"]);

  const missing = await router.fetch(
    new Request("https://example.com/unknown"),
    env,
    undefined,
  );
  assert.equal(missing.status, 307);
  assert.equal(missing.headers.get("Location"), "https://example.com/");
  assert.equal(fetched.length, 3);

  const staleApi = await router.fetch(
    new Request("https://example.com/api/action"),
    env,
    undefined,
  );
  assert.equal(staleApi.status, 410);
});

test("missing page redirects discard query parameters and support HEAD", async () => {
  const env = {
    ASSETS: { fetch: async () => new Response("static shell") },
  };
  for (const method of ["GET", "HEAD"]) {
    const response = await router.fetch(
      new Request("https://example.com/unknown?brand_id=invalid", { method }),
      env,
      undefined,
    );
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("Location"), "https://example.com/");
  }
});

test("missing assets and unsupported methods are not redirected", async () => {
  const env = {
    ASSETS: { fetch: async () => new Response("static shell") },
  };
  for (const path of [
    "/_next/static/missing.js",
    "/missing.png",
    "/favicon.ico",
  ]) {
    const response = await router.fetch(
      new Request(`https://example.com${path}`),
      env,
      undefined,
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Location"), null);
  }
  const response = await router.fetch(
    new Request("https://example.com/unknown", { method: "POST" }),
    env,
    undefined,
  );
  assert.equal(response.status, 405);
});
