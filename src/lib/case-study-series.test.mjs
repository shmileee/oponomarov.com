import assert from "node:assert/strict";
import { test } from "node:test";
import { seriesLinks } from "./case-study-series.mjs";

const folders = (...names) => names.map((folder) => ({ folder }));

test("a declared sequel gives the other study its prequel", () => {
  const links = seriesLinks([{ folder: "hooks", sequel: "versions" }, ...folders("versions", "fleet")]);
  assert.deepEqual(links.get("hooks"), { sequel: "versions" });
  assert.deepEqual(links.get("versions"), { prequel: "hooks" });
  assert.equal(links.has("fleet"), false);
});

test("a declared prequel works the same way round", () => {
  const links = seriesLinks([...folders("hooks"), { folder: "versions", prequel: "hooks" }]);
  assert.deepEqual(links.get("hooks"), { sequel: "versions" });
  assert.deepEqual(links.get("versions"), { prequel: "hooks" });
});

test("both sides declared and agreeing is fine", () => {
  const links = seriesLinks([{ folder: "hooks", sequel: "versions" }, { folder: "versions", prequel: "hooks" }]);
  assert.deepEqual(links.get("versions"), { prequel: "hooks" });
});

test("a chain of three links every neighbour", () => {
  const links = seriesLinks([{ folder: "a", sequel: "b" }, { folder: "b", sequel: "c" }, ...folders("c")]);
  assert.deepEqual(links.get("b"), { prequel: "a", sequel: "c" });
});

test("an unknown folder names the study that referenced it", () => {
  assert.throws(() => seriesLinks([{ folder: "hooks", sequel: "verions" }]), /"hooks" declares sequel "verions", which has no folder/);
});

test("a study cannot continue in itself", () => {
  assert.throws(() => seriesLinks([{ folder: "hooks", sequel: "hooks" }]), /its own sequel/);
});

test("two studies cannot claim the same sequel", () => {
  assert.throws(
    () => seriesLinks([{ folder: "a", sequel: "c" }, { folder: "b", sequel: "c" }, ...folders("c")]),
    /"c" cannot be the sequel of both "a" and "b"/,
  );
});

test("disagreeing declarations are an error, not a coin toss", () => {
  assert.throws(
    () => seriesLinks([{ folder: "a", sequel: "b" }, { folder: "b", prequel: "c" }, ...folders("c")]),
    /"b" has two prequels: "a" and "c"/,
  );
});
