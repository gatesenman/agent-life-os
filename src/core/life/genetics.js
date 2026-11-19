'use strict';
// 遗传：二倍体等位基因。每个性状两条等位基因，表型 = 均值（共显性）+ 后天漂移。
// 子代从父母各随机继承一条；以 mutationRate 概率发生突变（高斯扰动），突变被记录（定律 L9）。
const TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism', 'risk_tolerance', 'frugality', 'curiosity', 'vitality', 'intelligence'];
const TRAIT_ZH = { openness: '开放', conscientiousness: '尽责', extraversion: '外向', agreeableness: '宜人', neuroticism: '敏感', risk_tolerance: '冒险', frugality: '节俭', curiosity: '好奇', vitality: '体质', intelligence: '智力' };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// 由已知表型构造等位基因（主角：表型严格等于 DNA genome）
function allelesFromPhenotype(genome, rng) {
  const al = {};
  for (const t of TRAITS) {
    const v = genome[t] ?? rng();
    const d = Math.min(v, 1 - v, 0.15) * rng();
    al[t] = [r3(v + d), r3(v - d)];
  }
  return al;
}
function randomAlleles(rng) { const al = {}; for (const t of TRAITS) al[t] = [r3(rng()), r3(rng())]; return al; }

function inherit(mom, dad, rng, { mutationRate = 0.02, sigma = 0.08 } = {}) {
  const al = {}, mutations = [], origin = {};
  for (const t of TRAITS) {
    const im = rng() < 0.5 ? 0 : 1, id = rng() < 0.5 ? 0 : 1;
    let a = mom.alleles[t][im], b = dad.alleles[t][id];
    const oa = 'm' + im, ob = 'f' + id;
    if (rng() < mutationRate) { a = r3(clamp01(a + gauss(rng) * sigma)); mutations.push(t); }
    if (rng() < mutationRate) { b = r3(clamp01(b + gauss(rng) * sigma)); mutations.push(t); }
    al[t] = [a, b]; origin[t] = [oa, ob];
  }
  return { alleles: al, mutations, origin };
}
// 表型 = 等位基因均值 + 漂移（漂移是后天的，不改基因，不遗传）
function express(person, t) { const a = person.alleles[t]; return clamp01((a[0] + a[1]) / 2 + ((person.drift && person.drift[t]) || 0)); }
function phenotype(person) { const g = {}; for (const t of TRAITS) g[t] = r3(express(person, t)); return g; }

// L9 校验：子代每条等位基因必须来自对应亲本（或被记录为突变）
function verifyInheritance(child, mom, dad) {
  const errs = [];
  for (const t of TRAITS) {
    const [a, b] = child.alleles[t];
    const okA = mom.alleles[t].includes(a) || (child.mutations || []).includes(t);
    const okB = dad.alleles[t].includes(b) || (child.mutations || []).includes(t);
    if (!okA || !okB) errs.push(`${child.name} 的「${TRAIT_ZH[t]}」等位基因不来自父母`);
  }
  return errs;
}
module.exports = { TRAITS, TRAIT_ZH, allelesFromPhenotype, randomAlleles, inherit, express, phenotype, verifyInheritance, gauss, clamp01, r3 };
