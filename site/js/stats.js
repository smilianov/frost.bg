// stats.js — сметките зад историята по години. Чисти функции, без DOM.
//
// Договорът е преписан дума по дума от grid/frost_estimate.py: страницата
// смята същите числа, които мрежата е сметнала офлайн, и не бива да се
// разминава с тях (site/js/stats.parity.test.js доказва това за всичките
// 2 080 клетки).

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CUM = MONTH_DAYS.reduce((acc, d) => (acc.push(acc[acc.length - 1] + d), acc), [0]);

// "MM-DD" -> пореден ден 1..365 в невисокосната 2001 г.; 29 февруари се
// сгъва към 1 март (мрежата вече е сгъната така — истинският 29 февруари е
// загубен и не може да се възстанови тук).
export function dayOfYear(mmdd) {
  if (typeof mmdd !== "string" || !/^[0-9]{2}-[0-9]{2}$/.test(mmdd)) return null;
  const m = Number(mmdd.slice(0, 2)), d = Number(mmdd.slice(3));
  if (m < 1 || m > 12 || d < 1) return null;
  if (m === 2 && d === 29) return CUM[2] + 1;            // 1 март
  if (d > MONTH_DAYS[m - 1]) return null;
  return CUM[m - 1] + d;
}

export function toMMDD(day) {
  if (!Number.isInteger(day) || day < 1 || day > 365) return null;
  let m = 0;
  while (m < 12 && day > CUM[m + 1]) m++;
  const d = day - CUM[m];
  return `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const validRow = (r) => Array.isArray(r) && r.length === 3 && Number.isInteger(r[0]);

// Прозорецът е календарен: N избира годините periodEnd-N+1 … periodEnd.
// Липсваща година си остава липсваща — по-стари редове не влизат на нейно
// място. `withData` е колко от тези години наистина имат ред.
export function selectWindow(years, periodEnd, n) {
  const to = Number.isInteger(periodEnd) ? periodEnd : 0;
  const from = to - n + 1;
  const rows = (Array.isArray(years) ? years : [])
    .filter((r) => validRow(r) && r[0] >= from && r[0] <= to)
    .sort((a, b) => a[0] - b[0]);
  return { rows, from, to, withData: rows.length };
}

const MIN_YEARS = 10;

// Медиана (nearest-rank, консервативно при четен брой: по-късната напролет,
// по-ранната наесен) и персентил по ранг ceil(q·n).
function median(sorted, later) {
  const n = sorted.length;
  return sorted[later ? Math.floor(n / 2) : Math.floor((n - 1) / 2)];
}
function percentile(sorted, q) {
  return sorted[Math.max(1, Math.ceil(q * sorted.length)) - 1];
}

// Датите за един сезон, сортирани възходящо; негодните и null се махат.
const season = (rows, i) => rows.map((r) => dayOfYear(r[i])).filter((d) => d !== null).sort((a, b) => a - b);

export function pair(rows) {
  const springs = season(rows, 1), autumns = season(rows, 2);
  const okS = springs.length >= MIN_YEARS, okA = autumns.length >= MIN_YEARS;
  return {
    typical: {
      last_spring: okS ? toMMDD(median(springs, true)) : null,
      first_autumn: okA ? toMMDD(median(autumns, false)) : null,
    },
    safe: {
      last_spring: okS ? toMMDD(percentile(springs, 0.9)) : null,
      first_autumn: okA ? toMMDD(percentile(autumns, 0.1)) : null,
    },
    springCount: springs.length,
    autumnCount: autumns.length,
  };
}
