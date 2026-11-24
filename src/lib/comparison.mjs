// 只比较两个世界均有数据的纪元年区间；使用当年之前最近的观测，不外推未来。
export function alignPopulation(a, b) {
  const clean = (s) => (s?.years || []).map((year, i) => ({ year, value: s.pop[i] })).filter((x) => Number.isFinite(x.year) && Number.isFinite(x.value)).sort((x, y) => x.year - y.year);
  const A = clean(a), B = clean(b); if (!A.length || !B.length) return null;
  const start = Math.ceil(Math.max(A[0].year, B[0].year)), end = Math.floor(Math.min(A.at(-1).year, B.at(-1).year));
  if (end <= start) return null;
  const n = Math.min(120, end - start), years = Array.from({ length: n + 1 }, (_, i) => start + i * (end - start) / n);
  const sample = (items) => { let k = 0; return years.map((year) => { while (k + 1 < items.length && items[k + 1].year <= year) k++; return items[k].value; }); };
  return { start, end, years, a: sample(A), b: sample(B) };
}
export const eventKey = (e) => `${e.id}|${e.text}`;
