import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeaderAuth, type HeaderViewer } from "../src/components/header-auth";

function render(viewer: HeaderViewer | null | undefined) {
  return renderToStaticMarkup(createElement(HeaderAuth, { viewer }));
}

test("pending authentication never renders a login link", () => {
  const html = render(undefined);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /ログイン|href=/);
});

test("a failed lookup does not claim the viewer is signed out", () => {
  const html = render(null);
  assert.match(html, /href="\/account"/);
  assert.match(html, /アカウント/);
  assert.doesNotMatch(html, /ログイン|aria-busy/);
});

test("confirmed viewers get the appropriate account or login link", () => {
  const signedIn = render({
    signedIn: true,
    anonymous: false,
    name: "日本酒さん",
  });
  assert.match(signedIn, /href="\/account"/);
  assert.match(signedIn, /日本酒さん/);
  assert.doesNotMatch(signedIn, /ログイン/);
  assert.match(
    render({ signedIn: true, anonymous: false, name: null }),
    /アカウント/,
  );

  const signedOut = render({ signedIn: false, anonymous: false, name: null });
  assert.match(signedOut, /href="\/login"/);
  assert.match(signedOut, /ログイン/);

  const anonymous = render({ signedIn: false, anonymous: true, name: null });
  assert.match(anonymous, /href="\/login"/);
  assert.match(anonymous, /アカウントを保存/);
  assert.doesNotMatch(anonymous, /ログイン/);
});
