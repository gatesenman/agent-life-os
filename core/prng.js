'use strict';
// 确定性伪随机：同一 seed 永远得到同一序列
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function createRng(seed, stream = '') {
  return wrapRng(mulberry32(xmur3(String(seed) + '::' + stream)()));
}
// 在任意 [0,1) 生成器上构建便捷方法（所有方法都经由 r，便于计数/快进）
function wrapRng(r) {
  const rng = () => r();
  rng.float = (min = 0, max = 1) => min + (max - min) * r();
  rng.int = (min, max) => Math.floor(min + (max - min + 1) * r());
  rng.pick = (arr) => arr[Math.floor(r() * arr.length)];
  rng.chance = (p) => r() < p;
  rng.round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  rng.sample = (arr, n) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  };
  return rng;
}
function fingerprint(seed) {
  const h = xmur3(String(seed));
  return [h(), h()].map((x) => x.toString(16).padStart(8, '0')).join('').toUpperCase();
}
module.exports = { createRng, wrapRng, fingerprint };
