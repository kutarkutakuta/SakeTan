import assert from "node:assert/strict";
import test from "node:test";
import router from "../src/cloudflare-router";

test("ID pages serve the static shell while unrelated URLs stay 404", async () => {
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
  assert.equal(missing.status, 404);
  assert.equal(fetched.length, 3);

  const staleApi = await router.fetch(
    new Request("https://example.com/api/action"),
    env,
    undefined,
  );
  assert.equal(staleApi.status, 410);
});
