import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMMDD, readQuery, shareUrl, parseDecimal } from "./format.js";

test("formatMMDD bg", () => {
  assert.equal(formatMMDD("03-27", "bg"), "27 март");
  assert.equal(formatMMDD("11-01", "bg"), "1 ноември");
});
test("formatMMDD en", () => {
  assert.equal(formatMMDD("03-27", "en"), "March 27");
  assert.equal(formatMMDD("11-01", "en"), "November 1");
});
test("formatMMDD null/негодно -> —", () => {
  assert.equal(formatMMDD(null, "bg"), "—"); assert.equal(formatMMDD("x", "en"), "—");
});
test("readQuery чете lat и lon, иначе null", () => {
  assert.deepEqual(readQuery("?lat=42.184&lon=24.929"), { lat: 42.184, lon: 24.929 });
  assert.equal(readQuery("?lat=42"), null); assert.equal(readQuery(""), null); assert.equal(readQuery("?lat=x&lon=1"), null);
});
test("shareUrl слага lat/lon с 3 знака", () => {
  assert.equal(shareUrl("https://frost.bg/", 42.18425, 24.92936), "https://frost.bg/?lat=42.184&lon=24.929");
  assert.equal(shareUrl("https://frost.bg/en/", 42.1, 24.9), "https://frost.bg/en/?lat=42.1&lon=24.9");
});
test("shareUrl закръгля нагоре, когато четвъртият знак е ≥5", () => {
  assert.equal(shareUrl("https://frost.bg/", 42.18475, 24.5), "https://frost.bg/?lat=42.185&lon=24.5");
});
test("readQuery отхвърля шестнайсетично, извън ±90/±180, празно и само-интервали", () => {
  assert.equal(readQuery("?lat=0x2a&lon=24.929"), null);
  assert.equal(readQuery("?lat=91&lon=24.929"), null);
  assert.equal(readQuery("?lat=42.184&lon=181"), null);
  assert.equal(readQuery("?lat=&lon="), null);
  assert.equal(readQuery("?lat=%20&lon=24.929"), null);
  assert.deepEqual(readQuery("?lat=-90&lon=-180"), { lat: -90, lon: -180 });
});
test("parseDecimal: само чисти десетични в диапазона, иначе null", () => {
  assert.equal(parseDecimal(" 42.184 ", 90), 42.184);
  assert.equal(parseDecimal("-90", 90), -90);
  assert.equal(parseDecimal("90.0001", 90), null);
  assert.equal(parseDecimal("0x2a", 180), null);
  assert.equal(parseDecimal("", 90), null);
  assert.equal(parseDecimal("   ", 90), null);
});
