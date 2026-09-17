import assert from "node:assert/strict";
import test from "node:test";
import { linkifyText } from "../src/lib/linkify";

test("HTTP and HTTPS URLs are extracted from comment text", () => {
  assert.deepEqual(
    linkifyText("公式 https://example.com と http://example.jp/path を確認"),
    [
      { kind: "text", value: "公式 " },
      { kind: "link", value: "https://example.com" },
      { kind: "text", value: " と " },
      { kind: "link", value: "http://example.jp/path" },
      { kind: "text", value: " を確認" },
    ],
  );
});

test("sentence punctuation is kept outside the URL", () => {
  assert.deepEqual(linkifyText("こちら（https://example.com/a_(b)）。"), [
    { kind: "text", value: "こちら（" },
    { kind: "link", value: "https://example.com/a_(b)" },
    { kind: "text", value: "）。" },
  ]);
});

test("non-HTTP schemes are left as plain text", () => {
  assert.deepEqual(linkifyText("mailto:test@example.com"), [
    { kind: "text", value: "mailto:test@example.com" },
  ]);
});
