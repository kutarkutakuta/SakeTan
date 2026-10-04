import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement } from "react";
import { Header } from "../src/components/header";

test("extension attribute tolerance is limited to header background elements", () => {
  const header = Header();
  assert.equal(header.props.suppressHydrationWarning, true);

  const children = Children.toArray(header.props.children).filter(
    isValidElement<{ className?: string; suppressHydrationWarning?: boolean }>,
  );
  const plum = children.find(
    (child) => child.props.className === "header-plum",
  );
  assert.ok(plum);
  assert.equal(plum.props.suppressHydrationWarning, true);

  for (const child of children) {
    if (child !== plum)
      assert.equal(child.props.suppressHydrationWarning, undefined);
  }
});
