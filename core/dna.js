'use strict';
const crypto = require('crypto');
const { createRng, fingerprint } = require('./prng');

const CITY_ARCHETYPES = ['harbor-metropolis', 'mountain-town', 'desert-oasis', 'river-delta-city', 'island-village', 'neon-megacity', 'university-town'];
const FAMILIES = ['single-parent', 'big-family', 'grandparents', 'two-parents', 'orphanage', 'nomadic'];
const SKILLS = ['writing', 'translation', 'illustration', 'python', 'web-design', 'data-entry', 'video-script', 'research'];
const VALUES = ['autonomy', 'craft', 'security', 'community', 'adventure', 'knowledge', 'kindness', 'ambition'];
const OUTFITS = ['techwear', 'hoodie', 'lab-coat', 'kimono-modern', 'flight-jacket', 'minimal-suit'];
const ACCENTS = ['#00f0ff', '#ff2bd6', '#7cff4f', '#ffb000', '#9d7bff', '#ff4f5e'];

function newSeed() { return crypto.randomUUID(); }

function generateDNA(seed = newSeed(), overrides = {}) {
  const g = createRng(seed, 'genome');
  const o = createRng(seed, 'origin');
  const a = createRng(seed, 'appearance');
  const dna = {
    version: 1,
    seed: String(seed),
    fingerprint: fingerprint(seed),
    genome: {
      openness: g.round(g()), conscientiousness: g.round(g()), extraversion: g.round(g()),
      agreeableness: g.round(g()), neuroticism: g.round(g()), risk_tolerance: g.round(g()),
      frugality: g.round(g()), curiosity: g.round(g()),
    },
    origin: { city_archetype: o.pick(CITY_ARCHETYPES), birth_year: o.int(1985, 2004), family: o.pick(FAMILIES) },
    skills: o.sample(SKILLS, 3),
    values: o.sample(VALUES, 2),
    appearance: {
      body_height: a.round(a()), body_build: a.round(a()), skin_hue: a.round(a.float(0.02, 0.12)),
      skin_light: a.round(a.float(0.35, 0.85)), hair_style: a.int(0, 4), hair_hue: a.round(a()),
      eye_hue: a.round(a()), accent_color: a.pick(ACCENTS), outfit: a.pick(OUTFITS),
    },
    economy: { start_budget_usd: 20, daily_spend_cap_usd: 10, auto_approve_below_usd: 0 },
  };
  return deepMerge(dna, overrides);
}

function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object') base[k] = deepMerge({ ...base[k] }, v);
    else base[k] = v;
  }
  return base;
}

function validateDNA(dna) {
  const errs = [];
  if (!dna || dna.version !== 1) errs.push('version 必须为 1');
  if (!dna.seed) errs.push('缺少 seed');
  for (const [k, v] of Object.entries(dna.genome || {})) if (typeof v !== 'number' || v < 0 || v > 1) errs.push(`genome.${k} 必须在 0..1`);
  if (!Array.isArray(dna.skills) || !dna.skills.length) errs.push('skills 不能为空');
  return errs;
}

module.exports = { generateDNA, validateDNA, newSeed, SKILLS };
