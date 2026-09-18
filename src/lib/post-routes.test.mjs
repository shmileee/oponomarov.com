import assert from "node:assert/strict";
import { test } from "node:test";
import { postRoutes, slugForPostId } from "./post-routes.mjs";

const post = (id, aliases = []) => ({ id, data: { aliases } });

test("a post's slug is its file name without the date and extension", () => {
  assert.equal(slugForPostId("2024-12-15-mise-faster-smarter-tool-versioning.md"), "mise-faster-smarter-tool-versioning");
  assert.equal(slugForPostId("undated-note.md"), "undated-note");
});

test("every post gets a canonical route and every alias a redirect route", () => {
  const routes = postRoutes([
    post("2024-12-11-argocd-applicationset-generators.md", ["demystifying-argocd-applicationsets-pt1"]),
    post("2024-12-08-save-yourself-from-formatting-hell.md"),
  ]);
  assert.deepEqual(
    routes.map(({ slug, redirect, post: { id } }) => [slug, redirect, id]),
    [
      ["argocd-applicationset-generators", false, "2024-12-11-argocd-applicationset-generators.md"],
      ["demystifying-argocd-applicationsets-pt1", true, "2024-12-11-argocd-applicationset-generators.md"],
      ["save-yourself-from-formatting-hell", false, "2024-12-08-save-yourself-from-formatting-hell.md"],
    ],
  );
});

test("an alias equal to the post's own slug is ignored rather than duplicated", () => {
  const routes = postRoutes([post("2024-12-08-note.md", ["note"])]);
  assert.deepEqual(routes.map(({ slug, redirect }) => [slug, redirect]), [["note", false]]);
});

test("an alias that is another post's slug fails the build naming both owners", () => {
  assert.throws(
    () => postRoutes([post("2024-12-08-first.md"), post("2024-12-09-second.md", ["first"])]),
    /Post route "first" is claimed by both 2024-12-08-first\.md and 2024-12-09-second\.md/,
  );
});

test("an alias claimed by two posts fails the build", () => {
  assert.throws(
    () => postRoutes([post("2024-12-08-first.md", ["old"]), post("2024-12-09-second.md", ["old"])]),
    /Post route "old" is claimed by both/,
  );
});
