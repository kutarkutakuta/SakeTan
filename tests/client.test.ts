import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiRequestError,
  fetchJson,
  isMissingPageError,
} from "../src/lib/client";

test("fetchJson returns JSON and uses API or fallback error messages", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ value: 3 });
    assert.deepEqual(
      await fetchJson<{ value: number }>(
        "https://example.com",
        undefined,
        "失敗",
      ),
      { value: 3 },
    );

    globalThis.fetch = async () =>
      Response.json({ error: "APIのエラー" }, { status: 400 });
    await assert.rejects(
      fetchJson("https://example.com", undefined, "既定のエラー"),
      /APIのエラー/,
    );

    globalThis.fetch = async () => new Response(null, { status: 500 });
    await assert.rejects(
      fetchJson("https://example.com", undefined, "既定のエラー"),
      /既定のエラー/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("page loaders distinguish missing URLs from other API failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [400, 404, 401, 403, 500, 503]) {
      globalThis.fetch = async () =>
        Response.json({ error: "APIエラー" }, { status });
      await assert.rejects(
        fetchJson("https://example.com", undefined, "既定のエラー"),
        (reason) => {
          assert.ok(reason instanceof ApiRequestError);
          assert.equal(reason.status, status);
          assert.equal(reason.message, "APIエラー");
          assert.equal(
            isMissingPageError(reason),
            status === 400 || status === 404,
          );
          return true;
        },
      );
    }
    assert.equal(isMissingPageError(new TypeError("Failed to fetch")), false);
    assert.equal(
      isMissingPageError(new DOMException("Aborted", "AbortError")),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchJson rejects an aborted request before returning stale data", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(Response.json({ value: 3 })), 20);
      });
    const result = fetchJson(
      "https://example.com",
      { signal: controller.signal },
      "失敗",
    );
    controller.abort();
    await assert.rejects(
      result,
      (reason) =>
        reason instanceof DOMException && reason.name === "AbortError",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
