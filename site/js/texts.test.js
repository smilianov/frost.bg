import { test } from "node:test";
import assert from "node:assert/strict";
import { T } from "./texts.js";

test("bg и en имат едни и същи ключове", () => {
  assert.deepEqual(Object.keys(T.bg).sort(), Object.keys(T.en).sort());
});
test("никъде „мраз“; думата е „слана“", () => {
  const all = Object.values(T.bg).join(" ");
  assert.ok(!all.includes("мраз")); assert.ok(all.includes("слана"));
});
test("нищо празно", () => {
  for (const lang of ["bg", "en"]) for (const [k, v] of Object.entries(T[lang])) assert.ok(String(v).trim(), `${lang}.${k}`);
});
