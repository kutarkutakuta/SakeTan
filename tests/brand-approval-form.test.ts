import assert from "node:assert/strict";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { MasterForm } from "../src/components/master-form";
import { BrandReviewActions } from "../src/components/brand-review-actions";
import { ToastProvider } from "../src/components/toast-provider";
import type { Brewery } from "../src/lib/types";

const id = "10000000-0000-4000-8000-000000000001";
const brewery: Brewery = {
  id,
  name: "試験酒造",
  name_kana: "しけんしゅぞう",
  prefecture: "長野県",
};
function markup(
  status: "pending" | "approved",
  selectedBrewery: Brewery | null = brewery,
  admin = true,
) {
  const initial = {
    name: "申請の酒",
    name_kana: "しんせいのさけ",
    registration_status: status,
    is_active: true,
  };
  return load(
    renderToStaticMarkup(
      createElement(ToastProvider, {
        children: createElement(
          Fragment,
          null,
          createElement(BrandReviewActions, {
            brand: {
              id,
              ...initial,
              brewery_id: selectedBrewery?.id ?? null,
              created_at: "2026-10-12T00:00:00Z",
              shops: [],
            },
            onReviewed: () => undefined,
          }),
          createElement(MasterForm, {
            type: "brand",
            id,
            initial,
            initialBrewery: selectedBrewery,
            admin,
            kanaOnly: !admin,
          }),
        ),
      }),
    ),
  );
}

test("pending brand details expose one save-and-approve button and one brewery selection", () => {
  const $ = markup("pending");
  const approval = $("button").filter(
    (_, button) => $(button).text() === "保存して承認",
  );
  assert.equal(approval.length, 1);
  assert.equal(approval.attr("disabled"), undefined);
  assert.equal(
    $("button").filter((_, button) =>
      /変更を保存|登録を承認/.test($(button).text()),
    ).length,
    0,
  );
  assert.equal($("input[name=is_active]").length, 0);
  assert.equal($(".fixed-shop").length, 1);
  assert.match($.text(), /既存銘柄に統合/);
  assert.match($.text(), /却下/);
});
test("approval requires a brewery while registered and ordinary-editor saves retain their behavior", () => {
  const pending = markup("pending", null);
  assert.equal(
    pending("button")
      .filter((_, button) => pending(button).text() === "保存して承認")
      .is(":disabled"),
    true,
  );
  assert.match(pending.text(), /酒蔵を新規登録/);
  const registered = markup("approved");
  assert.equal(registered("button[type=submit]").text(), "変更を保存");
  assert.equal(registered("input[name=is_active]").length, 1);
  const ordinary = markup("pending", brewery, false);
  assert.equal(ordinary("button[type=submit]").text(), "かなを保存");
  assert.doesNotMatch(ordinary.text(), /保存して承認/);
});
