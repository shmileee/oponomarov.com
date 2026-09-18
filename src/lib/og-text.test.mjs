import assert from "node:assert/strict";
import { test } from "node:test";
import { fitText } from "./og-text.mjs";

test("text that fits is returned whole, trimmed", () => {
  assert.equal(fitText("  Short and sweet.  ", 40), "Short and sweet.");
});

test("a sentence that ends late enough closes the text without an ellipsis", () => {
  const text = "One Kyverno policy rewrites every image. It rolled out one namespace at a time, with no manifest edited anywhere.";
  assert.equal(fitText(text, 60), "One Kyverno policy rewrites every image.");
});

test("otherwise the cut falls after a whole word", () => {
  const text = "OS security releases trigger image builds; nodes rotate onto the patched image within hours";
  const fitted = fitText(text, 50);
  assert.equal(fitted, "OS security releases trigger image builds; nodes…");
  assert.ok(fitted.length <= 50);
});

test("punctuation before the cut is dropped, so no dangling comma or dash", () => {
  assert.equal(fitText("A migration, a rollback, a runbook, and a deleted scaffold", 30), "A migration, a rollback…");
  assert.equal(fitText("Version drift — between two laptops or between a laptop and CI — stopped", 20), "Version drift…");
});

test("a single long token is cut hard rather than dropped", () => {
  assert.equal(fitText("supercalifragilisticexpialidocious-and-then-some", 12), "supercalifr…");
});
