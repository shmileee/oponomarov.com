import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryAliases, categoryRedirects, uniqueCategories } from "./categories.mjs";

test("categories flatten to one sorted, unique list", () => {
  assert.deepEqual(uniqueCategories([["terraform", "terramate"], "aws", ["aws", "devex"]]), ["aws", "devex", "terraform", "terramate"]);
});

test("every alias redirects to a live category", () => {
  const live = ["aws", ...Object.values(categoryAliases)];
  assert.deepEqual(categoryRedirects(live), Object.entries(categoryAliases));
});

test("an alias pointing at a category no post carries fails the build", () => {
  assert.throws(() => categoryRedirects(["aws"]), /points at "devex", which no post carries/);
});

test("an alias that is also a live category fails the build", () => {
  assert.throws(() => categoryRedirects(["developer-tools", "devex"]), /is also a live category/);
});
