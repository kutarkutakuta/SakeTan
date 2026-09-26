import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson } from "../src/lib/client";

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
