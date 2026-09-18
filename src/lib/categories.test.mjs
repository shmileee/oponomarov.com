import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryRedirects, uniqueCategories } from "./categories.mjs";

test("categories flatten to one sorted, unique list", () => {
  assert.deepEqual(uniqueCategories([["terraform", "terramate"], "aws", ["aws", "devex"]]), ["aws", "devex", "terraform", "terramate"]);
});

test("an alias applies once its old slug is gone and its new slug is live", () => {
  assert.deepEqual(categoryRedirects(["aws", "devex"], { "developer-tools": "devex" }), [["developer-tools", "devex"]]);
});

test("an alias whose new slug no post carries yet is skipped, not an error", () => {
  assert.deepEqual(categoryRedirects(["aws"], { "developer-tools": "devex" }), []);
});

test("an alias whose old slug is still a live category is skipped", () => {
  assert.deepEqual(categoryRedirects(["developer-tools", "devex"], { "developer-tools": "devex" }), []);
});

test("the shipped aliases are read when none are passed", () => {
  assert.deepEqual(categoryRedirects(["devex"]), [["developer-tools", "devex"]]);
});
