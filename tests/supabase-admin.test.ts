import assert from "node:assert/strict";
import test from "node:test";
import { paged, publicClient } from "../scripts/supabase-admin";

test("script pagination retries future JWT errors on the same page without duplicates", async () => {
  const calls: number[] = [];
  const waits: number[] = [];
  const rows = Array.from({ length: 1000 }, (_, id) => ({ id }));
  const result = await paged<{ id: number }>(
    async (from, to) => {
      calls.push(from);
      assert.equal(to, from + 999);
      if (calls.length === 1 || calls.length === 3)
        return { data: null, error: { message: "JWT issued at future" } };
      return { data: from === 0 ? rows : [{ id: 1000 }], error: null };
    },
    {
      wait: async (delay) => {
        waits.push(delay);
      },
    },
  );
  assert.deepEqual(calls, [0, 0, 1000, 1000]);
  assert.deepEqual(waits, [1000, 1000]);
  assert.deepEqual(result, [...rows, { id: 1000 }]);
});

test("clock skew retries are bounded and other errors fail immediately", async () => {
  const waits: number[] = [];
  let attempts = 0;
  await assert.rejects(
    paged(
      async () => {
        attempts++;
        return { data: null, error: { message: "JWT issued at future" } };
      },
      {
        wait: async (delay) => {
          waits.push(delay);
        },
      },
    ),
    /JWT issued at future/,
  );
  assert.equal(attempts, 4);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  await assert.rejects(
    paged(async () => ({ data: null, error: { message: "Invalid API key" } }), {
      wait: async () => {
        assert.fail("Non-clock errors must not be retried");
      },
    }),
    /Invalid API key/,
  );
});

test("public build scripts use the publishable key even when a secret key is configured", async () => {
  const variables = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ] as const;
  const saved = variables.map((name) => process.env[name]);
  const savedFetch = globalThis.fetch;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_unused";
    globalThis.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), "sb_publishable_test");
      assert.notEqual(headers.get("authorization"), "Bearer sb_secret_unused");
      return Response.json([]);
    };
    const { error } = await publicClient().from("brands").select("id");
    assert.equal(error, null);
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert.throws(publicClient, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  } finally {
    globalThis.fetch = savedFetch;
    variables.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
});
