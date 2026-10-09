import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeRedirect } from "@/components/home-redirect";
import NotFound from "@/app/not-found";

test("not-found pages render only the silent home redirect", () => {
  assert.equal(NotFound().type, HomeRedirect);
  assert.equal(renderToStaticMarkup(createElement(HomeRedirect)), "");
});
