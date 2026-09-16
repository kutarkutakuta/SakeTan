import assert from "node:assert/strict";
import test from "node:test";
import { collectPaged } from "@/lib/paged-query";

test("collectPaged reads beyond a service row limit", async () => {
  const source = Array.from({ length: 2333 }, (_, index) => index);
  const ranges: Array<[number, number]> = [];
  const result = await collectPaged(async (from, to) => {
    ranges.push([from, to]);
    return source.slice(from, to + 1);
  });

  assert.equal(result.length, 2333);
  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  assert.deepEqual(result, source);
});

test("collectPaged checks for a final empty page after an exact page", async () => {
  const source = [1, 2];
  const result = await collectPaged(
    async (from, to) => source.slice(from, to + 1),
    2,
  );

  assert.deepEqual(result, source);
});
