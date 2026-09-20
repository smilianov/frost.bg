import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMMDD, readQuery, shareUrl, parseDecimal, placeLabel, geocodeUrl } from "./format.js";

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

test("placeLabel: име, област и община", () => {
  assert.equal(placeLabel({ name: "Ново Село", admin: "Пловдив", admin2: "Стамболийски" }), "Ново Село, Пловдив, Стамболийски");
  assert.equal(placeLabel({ name: "Ново Село", admin: "Област Кюстендил", admin2: "Община Невестино" }), "Ново Село, Област Кюстендил, Община Невестино");
});
test("placeLabel: без област/община — само каквото има", () => {
  assert.equal(placeLabel({ name: "Маноле", admin: "Пловдив", admin2: "" }), "Маноле, Пловдив");
  assert.equal(placeLabel({ name: "Маноле", admin: "", admin2: "Марица" }), "Маноле, Марица");
  assert.equal(placeLabel({ name: "Маноле", admin: "", admin2: "" }), "Маноле");
  assert.equal(placeLabel({ name: "Manole" }), "Manole");
});
test("placeLabel: общината не се повтаря, когато е същата като областта", () => {
  assert.equal(placeLabel({ name: "Ново Село", admin: "Област Стара Загора", admin2: "Стара Загора" }), "Ново Село, Област Стара Загора");
  assert.equal(placeLabel({ name: "Ново Село", admin: "Област Видин", admin2: "Община Ново Село" }), "Ново Село, Област Видин, Община Ново Село");
  assert.equal(placeLabel({ name: "Маноле", admin: "Пловдив", admin2: "Пловдив" }), "Маноле, Пловдив");
  // английските имена от Google носят наставка вместо представка
  assert.equal(placeLabel({ name: "Novo Selo", admin: "Stara Zagora Province", admin2: "Stara Zagora" }), "Novo Selo, Stara Zagora Province");
  assert.equal(placeLabel({ name: "Novo Selo", admin: "Stara Zagora Province", admin2: "Stara Zagora Municipality" }), "Novo Selo, Stara Zagora Province");
  assert.equal(placeLabel({ name: "Ново Село", admin: " Област Стара Загора", admin2: "Стара Загора " }), "Ново Село, Област Стара Загора");
});

test("geocodeUrl: кодира заявката и иска максимума предложения (10), за да излязат всички еднакви имена", () => {
  assert.equal(geocodeUrl("Ново село", "bg"), "/api/v1/geocode?q=%D0%9D%D0%BE%D0%B2%D0%BE%20%D1%81%D0%B5%D0%BB%D0%BE&lang=bg&limit=10");
  assert.equal(geocodeUrl("a&b=c", "en"), "/api/v1/geocode?q=a%26b%3Dc&lang=en&limit=10");
});
