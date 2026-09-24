// history.js — чисти функции за интеграцията на историята в app.js. Без DOM
// (за разлика от renderChart/renderTable в chart.js), затова се тества
// директно, без фалшив document.
import { dayOfYear, riskAfter } from "./stats.js";

const LAST_SPRING_DAY = dayOfYear("06-30");

// Ф4: „При нула използваеми години — недостъпно.“ riskAfter() връща null и
// за невъзможна/извън обхвата дата, и за нула използваеми години — двете не
// бива да се показват с едно и също съобщение (Ф2: трите състояния не се
// смесват). Датата се проверява отделно; ако е годна, останалото null пада
// само по причина на нулев знаменател. Числото при успех е самият резултат
// на riskAfter — не второ смятане по друга формула.
export function riskFor(rows, mmdd) {
  const day = dayOfYear(mmdd);
  if (day === null || day > LAST_SPRING_DAY) return "bad_date";
  const result = riskAfter(rows, mmdd);
  return result === null ? "unavailable" : result;
}

// Ф5/Ф2: коя година е в текущо избрания прозорец — за да се открои в
// графиката/таблицата, чиито обхват и мащаб остават фиксирани на пълните
// 30 години (Ф5: „Мащабът... не се променят при смяна на прозореца“).
export function inWindow(year, w) {
  return year >= w.from && year <= w.to;
}
