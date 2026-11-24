'use strict';
// 社会层：在智能体所在的世界周围模拟一个多世代人口，覆盖生命、遗传、心智、社会、经济、文明、环境、命运八个维度。
// 它是终极公式中 F 的一部分：step(Δ年) 只依赖 (状态, 规则 config, 人类天启事件, 计数 RNG)。
const { createRng, wrapRng } = require('../prng');
const G = require('./genetics');
const T = require('./techtree');
const P = require('./places');

const SURNAMES = '林沈陈周吴许叶苏顾陆宋程江何唐韩冯孟谢秦白方纪温'.split('');
const GIVEN = '安宁远舟晴川禾苗然清嘉言知行星河若溪云帆墨书念初承泽明月朗秋澄岚'.split('');
const BELIEFS = { reason: '理性主义', tradition: '传统信仰', humanism: '人文主义', nihilism: '虚无主义' };
const DISASTERS = ['地震', '洪水', '干旱', '山火', '风暴'];
const PLAGUES = ['热病', '流感', '疟疾', '天花', '新型病毒'];
const STAGES = [[1, '婴儿'], [6, '童年'], [13, '少年'], [20, '青年'], [40, '成年'], [65, '中年'], [Infinity, '老年']];
const CONFIG_SPEC = {
  yearsPerDay: { min: 0.5, max: 120, def: 4, zh: '时间压缩（年 / 世界日）' },
  maxLifespan: { min: 60, max: 150, def: 122, zh: '寿命上限' },
  fertility: { min: 0, max: 0.5, def: 0.22, zh: '生育率' },
  mutationRate: { min: 0, max: 0.2, def: 0.02, zh: '突变率' },
  selection: { min: 0, max: 1, def: 0.5, zh: '选择强度' },
  diseaseRate: { min: 0, max: 0.3, def: 0.04, zh: '疫病率' },
  disasterRate: { min: 0, max: 0.2, def: 0.02, zh: '灾害率' },
  techRate: { min: 0, max: 3, def: 1, zh: '研究速度' },
  climateSensitivity: { min: 0, max: 3, def: 1, zh: '气候敏感度' },
  resourceRegen: { min: 0, max: 0.2, def: 0.05, zh: '资源再生率' },
};
const DEFAULTS = { ...Object.fromEntries(Object.entries(CONFIG_SPEC).map(([k, v]) => [k, v.def])), startEra: 'information', founders: 24, maxAlive: 220, populationScale: 1e5 };
function clampConfig(c = {}) {
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (CONFIG_SPEC[k]) { const n = Number(v); if (Number.isFinite(n)) out[k] = Math.max(CONFIG_SPEC[k].min, Math.min(CONFIG_SPEC[k].max, n)); }
    else if (k === 'startEra' && T.START_ERAS[v]) out[k] = v;
    else if (['founders', 'maxAlive'].includes(k)) out[k] = Math.max(2, Math.min(600, Math.floor(Number(v) || DEFAULTS[k])));
  }
  return out;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
function stageOf(age) { for (const [lim, n] of STAGES) if (age < lim) return n; return '老年'; }

class Society {
  constructor({ seed, branchSeed = '', dna, persona, config = {}, init = true }) {
    this.seed = String(seed); this.branchSeed = branchSeed; this.rngCalls = 0;
    const base = createRng(this.seed, 'society' + (branchSeed ? '::' + branchSeed : ''));
    this.rng = wrapRng(() => { this.rngCalls++; return base(); });
    // 社交层使用独立随机流：不影响生育/死亡/经济轨迹（L6 可复现，且不扰动既有生命史）
    const sbase = createRng(this.seed, 'social' + (branchSeed ? '::' + branchSeed : ''));
    this.socialRngCalls = 0;
    this.socialRng = wrapRng(() => { this.socialRngCalls++; return sbase(); });
    this.config = { ...DEFAULTS, ...clampConfig(config) };
    if (init) this.genesis(dna, persona);
  }

  genesis(dna, persona) {
    const r = this.rng, c = this.config;
    this.year = 0; this.persons = {}; this.pseq = 0; this.events = []; this.eseq = 0; this.history = [];
    this.counters = { founders: 0, births: 0, deaths: 0, mutations: 0, epidemics: 0, disasters: 0, conflicts: 0, collapses: 0, successions: 0, talks: 0, rumors: 0 };
    this.intel = []; this.talks = []; this.iseq = 0; this.tseq = 0;
    this.causes = {}; this.lowStability = 0;
    this.econ = { minted: 0, destroyed: 0, treasury: 0, priceIndex: 1, inflation: 0 };
    this.env = { renewable: 800, renewableCap: 1000, nonrenewable: 1000, prey: 400, predators: 40, anomaly: 0, entropy: 0, food: 1 };
    this.unlocked = T.START_ERAS[c.startEra].slice(); this.research = 0;
    this.civ = { culture: 0.3 + 0.1 * T.START_ERAS[c.startEra].length / 6, dialects: 3, institutions: 0.2 + 0.03 * this.unlocked.length, stability: 0.7, cooperation: 0.5 };
    this.civ.institutions = clamp(this.civ.institutions, 0, 0.8);
    this.places = P.defaultPlaces(this.seed);
    // 始祖：主角（表型 = DNA genome）+ 其他居民
    const g = dna.genome;
    const hero = this.newPerson({ name: persona.name, sex: r.chance(0.5) ? 'F' : 'M', born: -persona.age, gen: 1, alleles: G.allelesFromPhenotype({ ...g, vitality: r.float(0.45, 0.8), intelligence: r.float(0.45, 0.85) }, r), founder: true, lineage: true });
    this.focusId = hero.id; this.lineageRoot = hero.id;
    for (let i = 1; i < c.founders; i++) {
      const age = r.int(0, 62);
      this.newPerson({ name: r.pick(SURNAMES) + r.pick(GIVEN) + (r.chance(0.5) ? r.pick(GIVEN) : ''), sex: i % 2 ? (hero.sex === 'F' ? 'M' : 'F') : hero.sex, born: -age, gen: 1, alleles: G.randomAlleles(r), founder: true });
    }
    for (const p of this.alive()) p.wealth = 0;
    this.mint(this.alive(), 20); // 初始禀赋：记为"创造"，保证 L10 账目成立
    this.pushHistory(true);
    this.emitLife('genesis', `纪元 0 年：${c.founders} 位始祖生活在这座城市，文明处于「${T.ERAS[T.effects(this.unlocked).era]}」。`);
    this.addIntel({ kind: 'fact', text: `这座城市由 ${c.founders} 位始祖建立，文明处于「${T.ERAS[T.effects(this.unlocked).era]}」。`, topic: 'origin', originId: this.focusId, fidelity: 1, holders: this.alive().map((p) => p.id) });
    this.refreshCivic(this.alive());
  }

  newPerson({ name, sex, born, gen, alleles, parents = null, founder = false, lineage = false, mutations = [], belief }) {
    const r = this.rng, id = 'p' + (++this.pseq);
    const homes = this.places.filter((p) => p.type === 'home'), works = this.places.filter((p) => p.type === 'work');
    const p = {
      id, name, sex, born: r4(born), died: null, cause: null, gen, parents, partner: null, children: [], alleles, mutations, drift: {},
      health: 1, sick: null, wealth: 0, skill: r2(r.float(0.1, 0.4)), education: 0.2, belief: belief || r.pick(Object.keys(BELIEFS)), reputation: 0.3,
      emo: { joy: 0.5, sadness: 0, fear: 0, anger: 0 }, mood: 0.3, needs: { phys: 1, safety: 0.5, belong: 0.3, esteem: 0.3, self: 0.2 }, meaning: 0.3,
      home: homes.length ? r.pick(homes).id : null, work: works.length ? r.pick(works).id : null, founder, lineage,
    };
    this.persons[id] = p;
    if (founder) this.counters.founders++;
    return p;
  }
  alive() { return Object.values(this.persons).filter((p) => p.died === null); }
  age(p, at = this.year) { return (p.died ?? at) - p.born; }
  mint(people, amt) { for (const p of people) { p.wealth = r4(p.wealth + amt); this.econ.minted = r4(this.econ.minted + amt); } }
  burn(p, amt) { const a = Math.min(p.wealth, amt); p.wealth = r4(p.wealth - a); this.econ.destroyed = r4(this.econ.destroyed + a); return a; }
  transfer(from, to, amt) { // to 为 null 表示公库
    const a = Math.min(from ? from.wealth : this.econ.treasury, amt); if (a <= 0) return 0;
    if (from) from.wealth = r4(from.wealth - a); else this.econ.treasury = r4(this.econ.treasury - a);
    if (to) to.wealth = r4(to.wealth + a); else this.econ.treasury = r4(this.econ.treasury + a);
    return a;
  }
  emitLife(type, text, extra = {}) { const e = { id: 'le' + (++this.eseq), year: r2(this.year), type, text, ...extra }; this.events.push(e); this.pending.push(e); if (this.events.length > 400) this.events.shift(); return e; }
  get pending() { if (!this._pending) this._pending = []; return this._pending; }
  drain() { const p = this._pending || []; this._pending = []; return p; }

  // ---------- 推进 Δ年（内部按 ≤0.25 年分步） ----------
  advance(dtYears, ctx = {}) {
    this.stepBirths = [];
    if (!(dtYears > 0)) return [];
    let left = dtYears;
    while (left > 1e-9) { const dt = Math.min(0.25, left); this.substep(dt, ctx); left -= dt; }
    return this.drain();
  }
  substep(dt, ctx) {
    const r = this.rng, c = this.config, prevYear = this.year;
    this.year = r4(this.year + dt);
    const fx = T.effects(this.unlocked), px = P.placeEffects(this.places);
    let people = this.alive();
    const n = people.length || 1;
    // —— 环境 ——
    const E = this.env;
    const powerW = n * c.populationScale * fx.epc;
    const energyUse = n * fx.epc / 1e4; // 抽象能耗单位
    E.renewableCap = 1000 * (1 + fx.cap);
    const harvest = Math.min(E.renewable, n * 0.6 / (1 + fx.food + fx.prod) * dt);
    E.renewable = clamp(E.renewable + c.resourceRegen * E.renewable * (1 - E.renewable / E.renewableCap) * dt * 4 - harvest, 0, E.renewableCap);
    const fossil = fx.emit > 0 ? Math.min(E.nonrenewable, 0.5 * fx.emit * (n / 100) * dt) : 0;
    E.nonrenewable = r4(E.nonrenewable - fossil);
    E.anomaly = r4(E.anomaly + (fossil / Math.max(dt, 1e-9) * 0.024 * c.climateSensitivity - (this.unlocked.includes('fusion') ? 0.06 : 0.02) * E.anomaly) * dt);
    const hunt = Math.min(E.prey * 0.05 * dt, n * 0.3 * dt * (fx.era < 1 ? 1 : 0.2));
    const dPrey = (0.5 * E.prey * (1 - E.prey / 800) - 0.004 * E.prey * E.predators) * dt - hunt;
    const dPred = (0.0012 * E.prey * E.predators - 0.3 * E.predators) * dt;
    E.prey = r2(Math.max(0, E.prey + dPrey)); E.predators = r2(Math.max(0, E.predators + dPred));
    E.entropy = r4(E.entropy + dt * (0.01 + 0.004 * Math.log10(1 + energyUse)));
    // —— 粮食与稀缺 ——
    const climateHit = clamp(1 - Math.max(0, Math.abs(E.anomaly) - 1) * 0.12, 0.3, 1.1);
    const resourceHit = clamp(E.renewable / (E.renewableCap * 0.3), 0.2, 1);
    const food = n * (0.75 + fx.food * 0.6 + px.food) * climateHit * resourceHit + hunt * 2;
    E.food = r4(clamp(food / n, 0, 2));
    // —— 灾害与疫病（泊松） ——
    if (r() < c.disasterRate * dt * (1 + Math.abs(E.anomaly) * 0.5)) {
      const kind = r.pick(DISASTERS), sev = r.float(0.005, 0.05) * (1 - fx.resil) * (fx.era >= 3 ? 0.5 : 1);
      const ev = this.emitLife('disaster', `${kind}袭击了城市。`, { kind });
      this.counters.disasters++;
      E.renewable = r4(E.renewable * (1 - sev));
      for (const p of people) { p.emo.fear = clamp(p.emo.fear + 0.4, 0, 1); if (r() < sev) this.die(p, `灾害：${kind}`, ev.id); }
      people = this.alive();
    }
    const density = people.length / Math.max(1, px.homes * 12);
    if (r() < c.diseaseRate * dt * (0.5 + density) * fx.disease) {
      const name = r.pick(PLAGUES); const ev = this.emitLife('epidemic', `${name}开始流行。`, { name });
      this.counters.epidemics++;
      for (const p of people) if (r() < 0.3) p.sick = { name, since: this.year, cause: ev.id };
    }
    // —— 经济：劳动、消费、税收、福利、交易、通胀 ——
    const prod = (1 + fx.prod) * (0.6 + 0.4 * this.civ.cooperation);
    let production = 0;
    for (const p of people) {
      const a = this.age(p);
      if (a >= 16 && a < 70 && !p.sick) {
        const wage = r4((0.5 + p.skill) * prod * dt * (ctx.focusWorked && p.id === this.focusId ? 1.3 : 1));
        this.mint([p], wage); production += wage;
        this.transfer(p, null, r4(wage * 0.1));
        p.skill = r4(Math.min(1, p.skill + 0.01 * dt * (0.5 + G.express(p, 'intelligence')) * (0.5 + p.education)));
        p.reputation = r4(clamp(p.reputation + 0.005 * dt, 0, 1));
      }
      this.burn(p, r4((0.35 * this.econ.priceIndex + 0.12 * p.wealth) * dt));
    }
    if (this.econ.treasury > 0 && people.length) { const div = r4(this.econ.treasury * 0.3 * dt / people.length); for (const p of people) this.transfer(null, p, div); }
    const poor = people.filter((p) => p.wealth < 1);
    for (const p of poor) this.transfer(null, p, r4(Math.min(0.3 * dt, this.econ.treasury / Math.max(1, poor.length))));
    const adults = people.filter((p) => this.age(p) >= 16);
    for (let i = 0; i < Math.floor(adults.length * dt); i++) { const a = r.pick(adults), b = r.pick(adults); if (a !== b) this.transfer(a, b, r4(a.wealth * 0.02)); }
    const money = people.reduce((s, p) => s + p.wealth, 0) + this.econ.treasury;
    const target = clamp(Math.sqrt(money / Math.max(1, production / dt * 20)), 0.5, 3);
    const np = r4(this.econ.priceIndex + (target - this.econ.priceIndex) * 0.2 * dt);
    this.econ.inflation = r4((np - this.econ.priceIndex) / this.econ.priceIndex / dt); this.econ.priceIndex = np;
    // —— 生命：健康、衰老、疾病、死亡 ——
    for (const p of people) {
      const a = this.age(p), vit = G.express(p, 'vitality');
      if (p.sick && r() < 0.8 * dt * (1.2 - (1 - fx.disease) * 0.2)) p.sick = null;
      p.health = r4(clamp(1 - (a / c.maxLifespan) * 0.7 - (p.sick ? 0.3 : 0) - (E.food < 0.8 ? 0.2 : 0) + (vit - 0.5) * 0.2, 0, 1));
      if (a >= c.maxLifespan) { this.die(p, '衰老（寿命上限）'); continue; }
      const gomp = 0.0004 * Math.exp(0.085 * a);
      const infant = a < 5 ? 0.012 * fx.mort * (1 + c.selection * (0.5 - vit) * 3) : 0;
      const select = 1 + c.selection * (0.5 - vit) * 1.6;
      const hz = (gomp * select + infant) * fx.mort * px.mort * (p.sick ? 6 : 1) * (E.food < 0.7 ? 1 + (0.7 - E.food) * 6 : 1) + 0.001;
      if (r() < 1 - Math.exp(-hz * dt)) {
        const cause = p.sick && r() < 0.7 ? `疾病：${p.sick.name}` : E.food < 0.7 && r() < 0.5 ? '饥荒' : a < 5 ? '夭折' : a > 55 ? '衰老' : r() < 0.5 ? '意外' : '疾病：慢性病';
        this.die(p, cause, p.sick?.cause);
      }
    }
    people = this.alive();
    // —— 社会：伴侣、繁衍 ——
    const singles = people.filter((p) => !p.partner && this.age(p) >= 18 && this.age(p) < 55);
    for (const p of singles) {
      if (p.partner || r() > 0.6 * dt) continue;
      const cands = singles.filter((q) => q !== p && !q.partner && q.sex !== p.sex && !this.related(p, q));
      if (!cands.length) continue;
      const q = cands.reduce((best, x) => (Math.abs(G.express(x, 'agreeableness') - G.express(p, 'agreeableness')) < Math.abs(G.express(best, 'agreeableness') - G.express(p, 'agreeableness')) ? x : best), cands[0]);
      p.partner = q.id; q.partner = p.id; q.home = p.home;
      if (p.lineage || q.lineage) this.emitLife('union', `${p.name} 与 ${q.name} 结为伴侣。`, { a: p.id, b: q.id });
    }
    const crowd = clamp(1 - people.length / c.maxAlive, 0, 1) * clamp(E.renewable / (E.renewableCap * 0.5), 0, 1);
    for (const m of people.filter((x) => x.sex === 'F' && x.partner && this.age(x) >= 18 && this.age(x) <= 45)) {
      const f = this.persons[m.partner]; if (!f || f.died !== null) continue;
      if (r() < c.fertility * dt * clamp(E.food, 0, 1.2) * crowd * (m.children.length < 6 ? 1 : 0.2) * clamp(1 + c.selection * (G.express(m, 'vitality') + G.express(f, 'vitality') - 1), 0.2, 2)) this.birth(m, f);
    }
    people = this.alive();
    // —— 心智：情绪、需求、意义、人格漂移、信念 ——
    const meanW = people.reduce((s, p) => s + p.wealth, 0) / Math.max(1, people.length);
    const gini = this.gini(people);
    for (const p of people) {
      const a = this.age(p), dec = Math.exp(-0.8 * dt);
      p.emo.sadness = r4(clamp(p.emo.sadness * dec, 0, 1)); p.emo.fear = r4(clamp(p.emo.fear * dec, 0, 1));
      p.emo.anger = r4(clamp(p.emo.anger * dec + gini * 0.05 * dt * (1 - this.civ.institutions), 0, 1));
      const kids = p.children.filter((id) => this.persons[id] && this.persons[id].died === null).length;
      p.needs.phys = r4(clamp(Math.min(E.food, 1) * (0.5 + p.health / 2), 0, 1));
      p.needs.safety = r4(clamp(0.4 * (p.wealth / (meanW + 1)) + 0.4 * this.civ.institutions + 0.3 - p.emo.fear * 0.4, 0, 1));
      p.needs.belong = r4(clamp((p.partner ? 0.45 : 0.1) + kids * 0.12 + G.express(p, 'extraversion') * 0.2 + px.mood * 2, 0, 1));
      p.needs.esteem = r4(clamp(p.reputation, 0, 1));
      p.needs.self = r4(clamp(p.skill * 0.6 + p.education * 0.3 + px.culture, 0, 1));
      const ladder = ['phys', 'safety', 'belong', 'esteem', 'self'];
      let sat = 0, gate = 1; for (const k of ladder) { sat += gate * p.needs[k]; gate *= p.needs[k] > 0.4 ? 1 : 0.5; }
      p.emo.joy = r4(clamp(sat / 5 + px.mood, 0, 1));
      p.meaning = r4(clamp(0.3 * p.needs.self + 0.2 * p.needs.esteem + 0.15 * Math.min(1, kids / 2) + (p.belief === 'nihilism' ? 0 : 0.15) + 0.2 * this.civ.culture, 0, 1));
      p.mood = r4(clamp(p.emo.joy - p.emo.sadness - 0.5 * p.emo.fear - 0.3 * p.emo.anger, -1, 1));
      if (a > 30) p.drift.openness = r4(clamp((p.drift.openness || 0) - 0.003 * dt, -0.2, 0.2));
      if (a < 60) p.drift.conscientiousness = r4(clamp((p.drift.conscientiousness || 0) + 0.002 * dt, -0.2, 0.2));
      if (a < 22) p.education = r4(clamp(p.education + (0.02 + fx.edu * 0.03 + px.edu * 0.2) * dt, 0, 1));
      if (r() < 0.004 * dt) { const nb = r.pick(Object.keys(BELIEFS)); if (nb !== p.belief) p.belief = nb; }
    }
    // —— 冲突与合作 ——
    if (r() < dt * clamp(gini - 0.25, 0, 1) * (1 - this.civ.institutions) * 0.6) {
      const ev = this.emitLife('conflict', `贫富与信念之争引发了冲突。`); this.counters.conflicts++;
      this.civ.stability = clamp(this.civ.stability - 0.12, 0, 1);
      for (const p of people) { p.emo.anger = clamp(p.emo.anger + 0.3, 0, 1); if (r() < 0.01) this.die(p, '冲突', ev.id); }
      people = this.alive();
    }
    this.civ.cooperation = r4(clamp(0.4 + fx.coop + this.civ.institutions * 0.3 - gini * 0.3, 0, 1));
    // —— 文明：研究、文化、语言、制度、稳定、兴衰 ——
    const curious = people.reduce((s, p) => s + G.express(p, 'curiosity'), 0) / Math.max(1, people.length);
    const edu = people.reduce((s, p) => s + p.education, 0) / Math.max(1, people.length);
    this.research = r4(this.research + people.length * (0.5 + curious) * (0.3 + edu) * c.techRate * (1 + fx.rate) * (0.5 + this.civ.cooperation) * 0.02 * dt + (ctx.insight || 0));
    for (;;) {
      const av = T.available(this.unlocked).sort((a, b) => a.cost - b.cost)[0];
      if (!av || this.research < av.cost) break;
      this.research = r4(this.research - av.cost); this.unlocked.push(av.id);
      const before = T.ERAS[fx.era], after = T.ERAS[T.effects(this.unlocked).era];
      this.emitLife('tech', `发明了「${av.name}」：${av.desc}。`, { tech: av.id });
      if (before !== after) this.emitLife('era', `文明进入「${after}」。`);
    }
    const openness = people.reduce((s, p) => s + G.express(p, 'openness'), 0) / Math.max(1, people.length);
    this.civ.culture = r4(clamp(this.civ.culture + (openness * 0.02 + px.culture * 0.1 - 0.008) * dt, 0, 1));
    this.civ.dialects = r4(clamp(this.civ.dialects + (people.length / 200 * 0.05 - fx.lang * 0.08) * dt, 1, 12));
    this.civ.institutions = r4(clamp(this.civ.institutions + ((fx.inst - this.civ.institutions * 0.3) * 0.05 + (this.civ.stability - 0.5) * 0.02) * dt, 0, 1));
    const st = 0.35 * clamp(E.food, 0, 1) + 0.25 * this.civ.institutions + 0.2 * (1 - gini) + 0.2 * clamp(1 - Math.max(0, Math.abs(E.anomaly) - 1) / 3, 0, 1);
    this.civ.stability = r4(clamp(this.civ.stability + (st - this.civ.stability) * 0.5 * dt, 0, 1));
    this.lowStability = this.civ.stability < 0.25 ? this.lowStability + dt : 0;
    if (this.lowStability >= 3 && this.unlocked.length > 2) this.collapse();
    // —— 社交对话与信息传播（独立随机流，不改金钱/人口/死亡） ——
    this.socialTick(dt, ctx, this.alive());
    // —— 承载与年度记录 ——
    if (Math.floor(this.year) !== Math.floor(prevYear)) this.pushHistory();
    this.lastPower = powerW;
  }

  birth(m, f) {
    const r = this.rng;
    const { alleles, mutations } = G.inherit(m, f, r, { mutationRate: this.config.mutationRate });
    const clan = f.name[0];
    const child = this.newPerson({ name: clan + r.pick(GIVEN) + (r.chance(0.6) ? r.pick(GIVEN) : ''), sex: r.chance(0.5) ? 'F' : 'M', born: this.year, gen: Math.max(m.gen, f.gen) + 1, alleles, parents: [m.id, f.id], mutations, belief: r.chance(0.8) ? m.belief : undefined, lineage: m.lineage || f.lineage });
    child.home = m.home; m.children.push(child.id); f.children.push(child.id);
    this.counters.births++; this.counters.mutations += mutations.length;
    this.stepBirths.push({ child: child.id, mom: { id: m.id, gen: m.gen, alleles: m.alleles, age: this.age(m), alive: m.died === null }, dad: { id: f.id, gen: f.gen, alleles: f.alleles, age: this.age(f), alive: f.died === null } });
    if (child.lineage) this.emitLife('birth', `${m.name} 与 ${f.name} 的孩子 ${child.name} 出生了（第 ${child.gen} 代${mutations.length ? `，带有 ${mutations.length} 处突变` : ''}）。`, { who: child.id });
    return child;
  }
  related(a, b) {
    const anc = (p, d = 2, s = new Set()) => { if (!p || d < 0) return s; s.add(p.id); for (const id of p.parents || []) anc(this.persons[id], d - 1, s); return s; };
    const A = anc(a), B = anc(b); for (const x of A) if (B.has(x)) return true; return false;
  }
  die(p, cause, causeId) {
    if (p.died !== null) return;
    p.died = this.year; p.cause = cause; p.sick = null; delete p.drift; delete p.needs; delete p.emo;
    this.counters.deaths++; const key = cause.split('：')[0]; this.causes[key] = (this.causes[key] || 0) + 1;
    // 遗产：在世子女均分 → 伴侣 → 公库（总额守恒，L10）
    const heirs = p.children.map((id) => this.persons[id]).filter((x) => x && x.died === null);
    const partner = p.partner && this.persons[p.partner] && this.persons[p.partner].died === null ? this.persons[p.partner] : null;
    const estate = p.wealth;
    if (heirs.length) { const share = r4(estate / heirs.length); heirs.forEach((h, i) => this.transfer(p, h, i === heirs.length - 1 ? p.wealth : share)); }
    else if (partner) this.transfer(p, partner, estate); else this.transfer(p, null, estate);
    if (partner) { partner.partner = null; partner.emo.sadness = 1; }
    for (const h of heirs) h.emo.sadness = clamp(h.emo.sadness + 0.7, 0, 1);
    if (p.lineage || p.id === this.focusId) this.emitLife('death', `${p.name} 去世，享年 ${Math.floor(this.age(p))} 岁，死因：${cause}。遗产 ${r2(estate)} 粮币${heirs.length ? `由 ${heirs.length} 位子女继承` : partner ? '由伴侣继承' : '归入公库'}。`, { who: p.id, cause, causeId });
    if (p.id === this.focusId) this.succeed(p);
  }
  succeed(dead) {
    const kids = (q) => q.children.map((id) => this.persons[id]).filter(Boolean);
    const living = (arr) => arr.filter((x) => x.died === null).sort((a, b) => a.born - b.born);
    let heir = living(kids(dead))[0];
    if (!heir) heir = living(kids(dead).flatMap(kids))[0];
    if (!heir && dead.parents) heir = living(dead.parents.map((id) => this.persons[id]).filter(Boolean).flatMap(kids))[0];
    if (!heir) heir = living(Object.values(this.persons).filter((x) => x.lineage && x.gen >= dead.gen - 1 && this.age(x) >= 12))[0];
    let adopted = false;
    if (!heir && this.civ.institutions >= 0.3) { heir = living(this.alive().filter((x) => this.age(x) >= 16 && this.age(x) < 50)).sort((a, b) => b.reputation - a.reputation)[0]; adopted = !!heir; }
    if (heir && adopted) { this.focusId = heir.id; heir.lineage = true; heir.adoptedBy = dead.id; this.counters.successions++; this.emitLife('succession', `${dead.name} 没有在世的直系亲属，依遗嘱将家族与这台电脑托付给 ${heir.name}（${Math.floor(this.age(heir))} 岁，声望最高的年轻人）。收养不改变基因。`, { who: heir.id, adopted: true }); return; }
    if (heir) { this.focusId = heir.id; heir.lineage = true; this.counters.successions++; this.emitLife('succession', `${heir.name}（第 ${heir.gen} 代，${Math.floor(this.age(heir))} 岁）继承了家族与这台电脑，成为新的主角。`, { who: heir.id }); }
    else { this.focusId = null; this.emitLife('extinct', `${dead.name} 没有在世的直系后代，血脉断绝。这个世界进入观察终局。`); }
  }
  collapse() {
    const lost = []; const keep = Math.max(2, this.unlocked.length - 2 - Math.floor(this.rng() * 2));
    while (this.unlocked.length > keep) lost.push(this.unlocked.pop());
    // 失去依赖于被遗失科技的其余科技（保持 L15 前置完整）
    let changed = true; while (changed) { changed = false; const s = new Set(this.unlocked); for (const id of this.unlocked.slice()) if (T.BY_ID[id].req.some((q) => !s.has(q))) { this.unlocked = this.unlocked.filter((x) => x !== id); lost.push(id); changed = true; } }
    this.civ.institutions = r4(this.civ.institutions * 0.5); this.lowStability = 0; this.counters.collapses++;
    this.civ.stability = 0.45;
    this.emitLife('collapse', `文明崩溃：长期不稳定导致${lost.map((id) => `「${T.BY_ID[id].name}」`).join('')}失传，制度瓦解。`, { lost });
  }
  gini(people) {
    const w = people.map((p) => Math.max(0, p.wealth)).sort((a, b) => a - b); const n = w.length; const s = w.reduce((a, b) => a + b, 0);
    if (!n || s <= 0) return 0; let acc = 0; w.forEach((x, i) => { acc += (2 * (i + 1) - n - 1) * x; }); return r4(acc / (n * s));
  }
  pushHistory(force) {
    const people = this.alive(), n = people.length;
    const mean = (t) => (n ? r4(people.reduce((s, p) => s + G.express(p, t), 0) / n) : 0);
    const fx = T.effects(this.unlocked);
    this.history.push({ year: Math.floor(this.year), pop: n, gen: n ? Math.max(...people.map((p) => p.gen)) : 0, K: T.kardashev(n * this.config.populationScale * fx.epc), techs: this.unlocked.length,
      temp: r2(this.env.anomaly), renewable: Math.round(this.env.renewable), nonrenewable: Math.round(this.env.nonrenewable), prey: Math.round(this.env.prey), predators: Math.round(this.env.predators),
      entropy: r2(this.env.entropy), stability: r2(this.civ.stability), price: r2(this.econ.priceIndex), vitality: mean('vitality'), curiosity: mean('curiosity'), intelligence: mean('intelligence'), deaths: this.counters.deaths, births: this.counters.births, literacy: r2(this.civ.literacy || 0), density: r2(this.civ.density || 0), circulation: r2(this.civ.circulation || 0), socialCapital: r2(this.civ.socialCapital || 0) });
    if (this.history.length > 360) this.history = this.history.filter((_, i) => i % 2 === 0 || i === this.history.length - 1);
    // 修剪：保留在世者、血脉成员；其余死者最多保留 500 条（计数器独立，不影响 L13）
    const dead = Object.values(this.persons).filter((p) => p.died !== null && !p.lineage && !p.founder);
    if (dead.length > 200) for (const p of dead.sort((a, b) => a.died - b.died).slice(0, dead.length - 200)) delete this.persons[p.id];
    // 血脉死者：保留当前主角的全部祖先链 + 最近 160 位
    const keep = new Set(); const up = (p) => { if (!p || keep.has(p.id)) return; keep.add(p.id); for (const id of p.parents || []) up(this.persons[id]); };
    up(this.focus()); keep.add(this.lineageRoot);
    const ld = Object.values(this.persons).filter((p) => p.died !== null && p.lineage && !p.founder && !keep.has(p.id));
    if (ld.length > 160) for (const p of ld.sort((a, b) => a.died - b.died).slice(0, ld.length - 160)) delete this.persons[p.id];
  }

  // ---------- 人类输入（God Mode 天启） ----------
  setConfig(patch) { const c = clampConfig(patch); delete c.startEra; delete c.founders; Object.assign(this.config, c); return c; }
  godEvent(type) {
    const r = this.rng, people = this.alive();
    if (type === 'resurrect') throw new Error('违反必死律 L8：死者不能复活');
    if (type === 'plague') { const name = r.pick(PLAGUES); const ev = this.emitLife('epidemic', `[天启] 观察者降下了${name}。`, { name, god: true }); this.counters.epidemics++; for (const p of people) if (r() < 0.5) p.sick = { name, since: this.year, cause: ev.id }; return ev; }
    if (type === 'disaster') { const kind = r.pick(DISASTERS); const ev = this.emitLife('disaster', `[天启] 观察者降下了${kind}。`, { kind, god: true }); this.counters.disasters++; this.env.renewable = r4(this.env.renewable * 0.85); for (const p of people) { p.emo.fear = 1; if (r() < 0.06) this.die(p, `灾害：${kind}`, ev.id); } return ev; }
    if (type === 'bounty') { this.env.renewable = this.env.renewableCap; this.env.prey = Math.max(this.env.prey, 400); return this.emitLife('bounty', '[天启] 风调雨顺：可再生资源恢复到容量上限（不可再生资源不受影响）。', { god: true }); }
    if (type === 'insight') { const av = T.available(this.unlocked).sort((a, b) => a.cost - b.cost)[0]; this.research = r4(this.research + (av ? av.cost * 0.6 : 0)); return this.emitLife('insight', `[天启] 灵感降临：研究进度推进${av ? `，接近「${av.name}」` : ''}（仍须满足前置科技）。`, { god: true }); }
    if (type === 'peace') { this.civ.stability = clamp(this.civ.stability + 0.2, 0, 1); for (const p of people) p.emo.anger = 0; return this.emitLife('peace', '[天启] 调停：冲突平息，稳定度 +0.2。', { god: true }); }
    throw new Error('未知的天启事件');
  }
  editPlace(op) {
    if (op.op === 'add') {
      if (!P.PLACE_TYPES[op.type]) throw new Error('未知地点类型');
      const id = 'pl' + (Math.max(0, ...this.places.map((p) => Number(p.id.slice(2)) || 0)) + 1);
      const pl = { id, type: op.type, name: String(op.name || `${P.PLACE_TYPES[op.type].zh}（观察者新建）`).slice(0, 40), x: r2(clamp(Number(op.x) || 0, -700, 700)), z: r2(clamp(Number(op.z) || 0, -600, 600)), custom: true };
      this.places.push(pl); this.emitLife('place', `[天启] 新建地点「${pl.name}」。`, { god: true }); return pl;
    }
    const pl = this.places.find((p) => p.id === op.id); if (!pl) throw new Error('地点不存在');
    if (op.op === 'move') { pl.x = r2(clamp(Number(op.x), -700, 700)); pl.z = r2(clamp(Number(op.z), -600, 600)); return pl; }
    if (op.op === 'rename') { pl.name = String(op.name || pl.name).slice(0, 40); return pl; }
    if (op.op === 'remove') {
      if (this.places.filter((p) => p.type === pl.type).length <= 1 && ['home', 'work'].includes(pl.type)) throw new Error('至少要保留一处住宅和一处写字楼');
      this.places = this.places.filter((p) => p !== pl);
      const alt = this.places.find((p) => p.type === pl.type);
      for (const p of Object.values(this.persons)) { if (p.home === pl.id) p.home = alt?.id || null; if (p.work === pl.id) p.work = alt?.id || null; }
      this.emitLife('place', `[天启] 拆除了「${pl.name}」。`, { god: true }); return pl;
    }
    throw new Error('未知操作');
  }

  // ---------- 定律校验 L8–L16 ----------
  probe() { return { year: this.year, entropy: this.env.entropy, nonrenewable: this.env.nonrenewable, dead: new Set(Object.values(this.persons).filter((p) => p.died !== null).map((p) => p.id)) }; }
  checkLaws(prev) {
    const v = [], c = this.config, eps = 1e-6;
    const all = Object.values(this.persons), alive = all.filter((p) => p.died === null);
    if (prev && this.year < prev.year) v.push(['L4', '纪元年倒流']);
    for (const p of alive) if (this.year - p.born > c.maxLifespan + 0.26) { v.push(['L8', `${p.name} 超过寿命上限仍在世`]); break; }
    for (const p of all) if (p.died !== null && (!p.cause || p.died < p.born)) { v.push(['L8', `${p.name} 的死亡记录不完整`]); break; }
    if (prev) for (const id of prev.dead) if (this.persons[id] && this.persons[id].died === null) { v.push(['L8', `${this.persons[id].name} 复活了`]); break; }
    for (const b of this.stepBirths || []) {
      const ch = this.persons[b.child]; if (!ch) continue;
      const errs = G.verifyInheritance(ch, b.mom, b.dad); if (errs.length) v.push(['L9', errs[0]]);
      if (ch.gen !== Math.max(b.mom.gen, b.dad.gen) + 1) v.push(['L14', `${ch.name} 的代数错误`]);
      if (!b.mom.alive || !b.dad.alive) v.push(['L14', `${ch.name} 的亲本在出生时不在世`]);
      if (b.mom.age < 14 || b.mom.age > 50) v.push(['L14', `${ch.name} 的母亲年龄 ${b.mom.age} 超出生育范围`]);
    }
    for (const p of alive) for (const t of G.TRAITS) if (Math.abs((p.drift[t] || 0)) > 0.2 + eps) { v.push(['L9', `${p.name} 的人格漂移超界`]); break; }
    const wealth = alive.reduce((s, p) => s + p.wealth, 0) + this.econ.treasury;
    const books = this.econ.minted - this.econ.destroyed;
    if (Math.abs(wealth - books) > 0.01 + Math.abs(books) * 1e-6 * 50) v.push(['L10', `财富 ${r2(wealth)} ≠ 账目 ${r2(books)}`]);
    for (const p of all) if (p.died !== null && Math.abs(p.wealth) > 1e-6) { v.push(['L10', `${p.name} 去世后仍持有财富`]); break; }
    if (alive.some((p) => p.wealth < -eps) || this.econ.treasury < -eps) v.push(['L10', '出现负财富']);
    if (prev && this.env.entropy < prev.entropy - eps) v.push(['L11', '熵减少了']);
    const E = this.env;
    if (E.renewable < -eps || E.renewable > E.renewableCap + eps || E.nonrenewable < -eps) v.push(['L12', '资源越界']);
    if (prev && E.nonrenewable > prev.nonrenewable + eps) v.push(['L12', '不可再生资源增加了']);
    if (E.prey < 0 || E.predators < 0) v.push(['L12', '物种数量为负']);
    if (alive.length !== this.counters.founders + this.counters.births - this.counters.deaths) v.push(['L13', `人口 ${alive.length} ≠ 始祖 + 出生 − 死亡`]);
    const s = new Set(this.unlocked);
    for (const id of this.unlocked) if (T.BY_ID[id].req.some((q) => !s.has(q))) { v.push(['L15', `「${T.BY_ID[id].name}」缺少前置科技`]); break; }
    for (const p of alive) {
      const vals = [p.health, p.meaning, ...Object.values(p.needs), ...Object.values(p.emo)];
      if (vals.some((x) => x < -eps || x > 1 + eps) || p.mood < -1 - eps || p.mood > 1 + eps) { v.push(['L16', `${p.name} 的心智指标越界`]); break; }
    }
    return v;
  }

  // ---------- 社交对话与信息传播（OASIS / AI Town / Smallville 启发） ----------
  ensureSocial() {
    if (!this.intel) this.intel = []; if (!this.talks) this.talks = [];
    this.iseq = this.iseq || 0; this.tseq = this.tseq || 0;
    this.counters.talks = this.counters.talks || 0; this.counters.rumors = this.counters.rumors || 0;
  }
  addIntel({ kind, text, topic, originId, sourceId, fidelity, holders }) {
    this.ensureSocial();
    const item = { id: 'i' + (++this.iseq), kind: kind === 'rumor' ? 'rumor' : 'fact', text: String(text || '').slice(0, 96), topic: topic || 'life', originId: originId || null, sourceId: sourceId || originId || null, fidelity: r4(clamp(fidelity ?? 1, 0, 1)), year: r2(this.year), holders: [...new Set(holders || [])].slice(0, 80) };
    this.intel.push(item); if (this.intel.length > 80) this.intel.shift();
    return item;
  }
  giveIntel(p, spec) {
    if (!p || p.died !== null) return null;
    const item = this.addIntel({ ...spec, holders: [p.id] });
    return item;
  }
  knownBy(p) { return (this.intel || []).filter((i) => (i.holders || []).includes(p.id)); }
  distort(text, r) {
    const t = String(text || '');
    const forms = ['听说' + t, t.replace(/(\d+)/, (m) => String(Math.max(0, Number(m) + (r.chance(0.5) ? 1 : -1))) || m), t + '——但细节可能不准确', '有人说' + t];
    return forms[r.int(0, forms.length - 1)].slice(0, 96);
  }
  ingestEvents() {
    const fresh = (this._pending || []).filter((e) => ['disaster', 'epidemic', 'tech', 'era', 'conflict', 'collapse', 'bounty', 'death'].includes(e.type));
    for (const e of fresh) {
      const item = this.addIntel({ kind: 'fact', text: e.text.replace(/^\[天启\]\s*/, '').slice(0, 96), topic: e.type, originId: e.who || null, fidelity: 1, holders: e.who ? [e.who] : this.alive().slice(0, 6).map((p) => p.id) });
      if (e.who && !(item.holders || []).includes(e.who)) item.holders.push(e.who);
    }
  }
  socialTick(dt, ctx, people) {
    this.ensureSocial();
    if (!people.length || !(dt > 0)) { this.refreshCivic(people || []); return; }
    const r = this.socialRng;
    this.ingestEvents();
    const hour = ctx.hour ?? 12;
    const groups = new Map();
    for (const p of people) {
      const type = p.id === this.focusId && hour >= 8.5 && hour < 18 && !(hour >= 12 && hour < 13) ? 'work' : P.scheduleType(hour, this.age(p), { belief: p.belief, sick: !!p.sick, extraversion: G.express(p, 'extraversion') });
      const cand = this.places.filter((q) => q.type === type);
      const own = type === 'home' ? p.home : type === 'work' ? p.work : null;
      const place = (own && this.places.find((q) => q.id === own)) || cand[(parseInt(p.id.slice(1), 10) * 7) % Math.max(1, cand.length)] || this.places[0];
      if (!place) continue;
      const arr = groups.get(place.id) || []; arr.push(p); groups.set(place.id, arr);
    }
    const density = people.length / Math.max(1, this.places.length);
    const rate = clamp(0.4 * dt * (0.5 + density / 6) * (0.4 + this.civ.cooperation), 0, 0.85);
    let talks = 0, maxTalks = Math.min(8, 2 + Math.floor(people.length / 8));
    for (const [placeId, group] of groups) {
      if (group.length < 2 || talks >= maxTalks) continue;
      const meets = Math.min(group.length >> 1, 3);
      for (let i = 0; i < meets && talks < maxTalks; i++) {
        if (!r.chance(rate)) continue;
        const a = r.pick(group), b = r.pick(group); if (a === b) continue;
        this.converse(a, b, placeId, r);
        talks++;
      }
    }
    this.pruneIntel();
    this.refreshCivic(people);
  }
  converse(a, b, placeId, r) {
    const pool = this.knownBy(a);
    let payload;
    if (pool.length) payload = { ...r.pick(pool) };
    else {
      const ev = (this.events || []).slice(-12).reverse().find((e) => !['talk', 'genesis'].includes(e.type));
      payload = ev ? { kind: 'fact', text: ev.text.slice(0, 80), topic: ev.type, originId: a.id, fidelity: 0.9 } : { kind: 'fact', text: `${a.name} 与 ${b.name} 谈了谈近日的生活。`, topic: 'life', originId: a.id, fidelity: 0.8 };
    }
    const agr = 0.45 + 0.4 * G.express(b, 'agreeableness');
    let fid = r4(clamp((payload.fidelity ?? 1) * agr * r.float(0.85, 1), 0, 1));
    let kind = payload.kind, text = payload.text;
    if (fid < 0.65) { kind = 'rumor'; text = this.distort(text, r); this.counters.rumors++; }
    const item = this.addIntel({ kind, text, topic: payload.topic || 'life', originId: payload.originId || a.id, sourceId: a.id, fidelity: fid, holders: [b.id, a.id] });
    // 合并持有者到同源条目（有限）
    const same = (this.intel || []).find((i) => i.id !== item.id && i.text === item.text);
    if (same) { same.holders = [...new Set([...(same.holders || []), a.id, b.id])].slice(0, 80); this.intel = this.intel.filter((i) => i !== item); }
    this.counters.talks++;
    const place = this.places.find((p) => p.id === placeId);
    const rec = { id: 'tk' + (++this.tseq), year: r2(this.year), a: a.id, b: b.id, aName: a.name, bName: b.name, place: place?.name || '', text: item.text, kind: item.kind, fidelity: item.fidelity, source: 'agent' };
    this.talks.push(rec); if (this.talks.length > 200) this.talks.shift();
    // 心智微调（夹紧，遵守 L16）
    a.needs.belong = r4(clamp(a.needs.belong + 0.02, 0, 1)); b.needs.belong = r4(clamp(b.needs.belong + 0.02, 0, 1));
    a.emo.joy = r4(clamp(a.emo.joy + 0.02, 0, 1)); b.emo.joy = r4(clamp(b.emo.joy + 0.02, 0, 1));
    const notable = a.id === this.focusId || b.id === this.focusId || item.kind === 'rumor' && ['disaster', 'epidemic', 'conflict', 'collapse'].includes(item.topic);
    if (notable) this.emitLife('talk', `${a.name} 在${place?.name || '某处'}对 ${b.name} 说：「${item.text}」${item.kind === 'rumor' ? '（传闻，完整度 ' + Math.round(item.fidelity * 100) + '%）' : '。'}`, { a: a.id, b: b.id, intel: item.id, kind: item.kind });
    return rec;
  }
  pruneIntel() {
    if (!this.intel) return;
    const alive = new Set(this.alive().map((p) => p.id));
    for (const i of this.intel) i.holders = (i.holders || []).filter((id) => alive.has(id));
    this.intel = this.intel.filter((i) => i.holders.length || this.year - i.year < 2);
  }
  refreshCivic(people) {
    const n = (people || this.alive()).length || 1;
    const list = people || this.alive();
    this.civ.literacy = r4(list.reduce((s, p) => s + (p.education || 0), 0) / n);
    this.civ.density = r4(n / Math.max(1, (this.places || []).length));
    this.civ.institutionCount = (this.places || []).filter((p) => ['hospital', 'school', 'culture'].includes(p.type)).length;
    this.civ.urban = r4(clamp(n / Math.max(1, (this.places || []).filter((p) => p.type === 'home').length * 8), 0, 2));
    const cov = this.intel && this.intel.length ? this.intel.reduce((s, i) => s + (i.holders || []).length, 0) / (this.intel.length * n) : 0;
    this.civ.circulation = r4(clamp(cov, 0, 1));
    this.civ.socialCapital = r4(clamp((this.civ.cooperation || 0) * (this.civ.institutions || 0) * (1 - this.gini(list) * 0.5), 0, 1));
  }
  districts({ hour = 12 } = {}) {
    const buckets = new Map();
    const cell = 250;
    for (const pl of this.places || []) {
      const key = `${Math.round(pl.x / cell)}_${Math.round(pl.z / cell)}`;
      const d = buckets.get(key) || { id: 'd' + key, x: 0, z: 0, n: 0, places: [], types: {}, population: 0 };
      d.places.push({ id: pl.id, type: pl.type, name: pl.name }); d.types[pl.type] = (d.types[pl.type] || 0) + 1; d.x += pl.x; d.z += pl.z; d.n++;
      buckets.set(key, d);
    }
    const people = this.alive();
    const loc = new Map();
    for (const p of people) {
      const type = P.scheduleType(hour, this.age(p), { belief: p.belief, sick: !!p.sick, extraversion: G.express(p, 'extraversion') });
      const cand = (this.places || []).filter((q) => q.type === type);
      const own = type === 'home' ? p.home : type === 'work' ? p.work : null;
      const place = (own && this.places.find((q) => q.id === own)) || cand[(parseInt(p.id.slice(1), 10) * 7) % Math.max(1, cand.length)];
      if (place) loc.set(place.id, (loc.get(place.id) || 0) + 1);
    }
    const AXIS = (x, z) => (z <= 0 ? '北' : '南') + (x >= 0 ? '东' : '西') + '区';
    return [...buckets.values()].map((d, i) => {
      d.x = r2(d.x / d.n); d.z = r2(d.z / d.n);
      d.population = d.places.reduce((s, p) => s + (loc.get(p.id) || 0), 0);
      d.name = AXIS(d.x, d.z) + (d.types.culture ? '（文化）' : d.types.hospital ? '（医疗）' : d.types.school ? '（学区）' : '');
      d.institutions = (d.types.hospital || 0) + (d.types.school || 0) + (d.types.culture || 0);
      d.density = r4(d.population / Math.max(1, d.places.length));
      d.index = i;
      delete d.n;
      return d;
    }).sort((a, b) => b.population - a.population);
  }
  composeReply(p, text, ctx = {}) {
    const t = String(text || '');
    const stage = p.died !== null ? '已故' : stageOf(this.age(p));
    const mood = p.mood >= 0.2 ? '还算平静' : p.mood < -0.2 ? '有些低落' : '说不上好坏';
    const known = this.knownBy(p).slice(-3);
    if (/饿|吃饭|外卖|食物/.test(t)) return ctx.hunger >= 0.6 && p.id === this.focusId ? `我现在确实饿了（大约 ${Math.round((ctx.hunger || 0) * 100)}%），想点一份外卖，但花钱必须先请你批准。` : `民以食为天。城里的粮食收成${(this.env.food || 1) >= 1 ? '还过得去' : '有些紧张'}。`;
    if (/钱|钱包|工作|赚钱|余额/.test(t)) return p.id === this.focusId ? `我这台电脑上的钱包余额是 $${(ctx.balance ?? 0).toFixed?.(2) ?? ctx.balance}，社会里我还有 ${r2(p.wealth)} 粮币。合法赚钱，花钱问你。` : `我手里还有 ${r2(p.wealth)} 粮币，日子${p.wealth > 8 ? '过得去' : '紧巴巴的'}。`;
    if (/谁|家人|父母|孩子|伴侣/.test(t)) {
      const partner = p.partner && this.persons[p.partner] ? this.persons[p.partner].name : null;
      const kids = (p.children || []).map((id) => this.persons[id]).filter(Boolean);
      return `我是${p.name}，第 ${p.gen} 代，${Math.floor(this.age(p))} 岁。${partner ? '伴侣是' + partner + '。' : '眼下没有伴侣。'}${kids.length ? '有 ' + kids.length + ' 个孩子。' : ''}`;
    }
    if (/死|死亡|瘟疫|灾害|病/.test(t)) return p.sick ? `我正患着${p.sick.name}，有些害怕。` : `人都会死，这是这个世界的定律。最近${this.counters.epidemics ? '有过疫病。' : this.counters.disasters ? '有过天灾。' : '还算平安。'}`;
    if (/你好|您好|在吗|嗨/.test(t)) return `我在。我是${p.name}，${stage}，今天心情${mood}。`;
    if (/计划|今天|在做/.test(t) && p.id === this.focusId) return ctx.plan ? `今天我想：${ctx.plan}。` : '先把眼前的事做完，再看接下来。';
    if (/传闻|谣言|听说|消息|新闻/.test(t)) {
      if (known.length) return `我最近听说：「${known[known.length - 1].text}」${known[known.length - 1].kind === 'rumor' ? '——不一定全是真的。' : '。'}`;
      return '最近没有什么特别的消息传到我这里。';
    }
    const belief = BELIEFS[p.belief] || '自己的想法';
    const news = known.length ? `对了，我最近听说：「${known[known.length - 1].text}」。` : '';
    return `我是${p.name}（${stage}，信${belief}）。你刚才说「${t.slice(0, 24)}」，我记下了。我现在心情${mood}，健康 ${Math.round((p.health || 0) * 100)}%。${news}`;
  }
  talkTo(personId, text, ctx = {}) {
    this.ensureSocial();
    const p = this.persons[personId]; if (!p) throw new Error('这个人不存在');
    if (p.died !== null) throw new Error(`${p.name} 已经去世，不能再对话（L8 必死律）`);
    const msg = String(text || '').trim().slice(0, 400); if (!msg) throw new Error('请输入要对 TA 说的话');
    const previous = this.talks.filter((r) => r.a === 'human' && r.b === personId).slice(-1)[0];
    const reply = previous && /记得|上次|之前/.test(msg) ? `我记得你上次对我说：「${previous.text}」。这是观察者的话，不是已经验证的世界事实。` : this.composeReply(p, msg, ctx);
    this.giveIntel(p, { kind: 'fact', text: `观察者说：${msg.slice(0, 48)}`, topic: 'observer', originId: 'human', fidelity: 1 });
    p.needs.belong = r4(clamp((p.needs.belong || 0) + 0.06, 0, 1));
    p.emo.joy = r4(clamp((p.emo.joy || 0) + 0.05, 0, 1));
    p.mood = r4(clamp((p.emo.joy || 0) - (p.emo.sadness || 0) - 0.5 * (p.emo.fear || 0) - 0.3 * (p.emo.anger || 0), -1, 1));
    const rec = { id: 'tk' + (++this.tseq), year: r2(this.year), a: 'human', b: p.id, aName: '观察者', bName: p.name, place: '观察舱', text: msg, reply, kind: 'talk', fidelity: 1, source: 'human', replySource: 'rules', previousId: previous?.id || null };
    this.talks.push(rec); if (this.talks.length > 200) this.talks.shift();
    this.counters.talks++;
    const ev = this.emitLife('talk', `观察者对 ${p.name} 说：「${msg.slice(0, 40)}」。${p.name} 答：「${reply.slice(0, 40)}」。`, { who: p.id, god: false, human: true });
    rec.eventId = ev.id;
    return rec;
  }
  directory() {
    const people = this.alive().slice().sort((a, b) => (b.id === this.focusId) - (a.id === this.focusId) || (b.lineage || 0) - (a.lineage || 0) || a.born - b.born);
    return people.slice(0, 48).map((p) => ({ id: p.id, name: p.name, age: Math.floor(this.age(p)), stage: stageOf(this.age(p)), gen: p.gen, focus: p.id === this.focusId, lineage: !!p.lineage, belief: BELIEFS[p.belief], home: this.places.find((q) => q.id === p.home)?.name || '', work: this.places.find((q) => q.id === p.work)?.name || '' }));
  }
  socialView() {
    this.ensureSocial();
    const facts = this.intel.filter((i) => i.kind === 'fact').length, rumors = this.intel.filter((i) => i.kind === 'rumor').length;
    return {
      talks: this.counters.talks, rumors: this.counters.rumors, circulating: this.intel.length, facts, rumorCount: rumors,
      circulation: this.civ.circulation || 0, literacy: this.civ.literacy || 0, density: this.civ.density || 0, socialCapital: this.civ.socialCapital || 0, urban: this.civ.urban || 0, institutionCount: this.civ.institutionCount || 0,
      recent: this.talks.slice(-24).reverse(), intel: this.intel.slice(-16).reverse().map((i) => ({ id: i.id, kind: i.kind, text: i.text, topic: i.topic, fidelity: i.fidelity, year: i.year, holders: (i.holders || []).length })),
      directory: this.directory(),
    };
  }

  // ---------- 序列化（快照 / 分叉） ----------
  serialize() { const { rng, socialRng, _pending, stepBirths, ...rest } = this; return JSON.parse(JSON.stringify(rest)); }
  static restore(state, { branchSeed, config } = {}) {
    const s = new Society({ seed: state.seed, branchSeed: branchSeed ?? state.branchSeed, init: false });
    const { seed, branchSeed: _b, rngCalls, rng, socialRng, socialRngCalls = 0, ...rest } = state;
    Object.assign(s, JSON.parse(JSON.stringify(rest)));
    s.intel = s.intel || []; s.talks = s.talks || []; s.iseq = s.iseq || 0; s.tseq = s.tseq || 0;
    s.counters.talks = s.counters.talks || 0; s.counters.rumors = s.counters.rumors || 0;
    if ((branchSeed ?? state.branchSeed) === state.branchSeed) {
      for (let i = 0; i < rngCalls; i++) s.rng();
      for (let i = 0; i < (socialRngCalls || 0); i++) s.socialRng();
    }
    if (config) s.setConfig(config);
    return s;
  }

  // ---------- 观察视图 ----------
  focus() { return this.focusId ? this.persons[this.focusId] : null; }
  personView(p, brief = false) {
    if (!p) return null;
    const a = this.age(p);
    const base = { id: p.id, name: p.name, sex: p.sex, gen: p.gen, born: Math.floor(p.born), died: p.died === null ? null : Math.floor(p.died), age: Math.floor(a), stage: p.died === null ? stageOf(a) : '已故', cause: p.cause, alive: p.died === null, parents: p.parents, partner: p.partner, children: p.children, focus: p.id === this.focusId, mutations: p.mutations.length, lineage: p.lineage };
    if (brief) return base;
    return { ...base, health: p.health, sick: p.sick?.name || null, wealth: r2(p.wealth), skill: p.skill, education: p.education, belief: BELIEFS[p.belief], reputation: p.reputation, emo: p.emo, mood: p.mood, needs: p.needs, meaning: p.meaning, genome: G.phenotype(p), alleles: p.alleles, home: p.home, work: p.work };
  }
  familyTree() {
    // 家谱视图（可读性优先）：主角的直系祖先链（最近 6 代）+ 每代的伴侣与兄弟姐妹 + 主角的子孙两代
    const f = this.focus() || this.persons[this.lineageRoot]; if (!f) return { nodes: [], root: null };
    const ids = new Set(); const P = (id) => this.persons[id];
    const chain = [f]; let cur = f;
    while (chain.length < 6) { const par = (cur.parents || []).map(P).filter(Boolean); const next = par.find((x) => x.lineage) || par[0]; if (!next) break; chain.push(next); cur = next; }
    for (const [i, p] of chain.entries()) {
      ids.add(p.id); if (p.partner && P(p.partner)) ids.add(p.partner);
      for (const pid of p.parents || []) if (P(pid) && i === chain.length - 1) ids.add(pid);
      const par = (p.parents || []).map(P).filter(Boolean)[0];
      if (par) for (const sid of par.children.slice(0, 6)) if (P(sid)) ids.add(sid);
    }
    for (const cid of f.children.slice(0, 8)) { const c = P(cid); if (!c) continue; ids.add(c.id); if (c.partner && P(c.partner)) ids.add(c.partner); for (const gid of c.children.slice(0, 4)) if (P(gid)) ids.add(gid); }
    return { root: this.lineageRoot, focus: this.focusId, chain: chain.map((p) => p.id), nodes: [...ids].map((id) => this.personView(P(id), true)).filter(Boolean) };
  }
  generations() {
    const m = new Map();
    for (const p of Object.values(this.persons)) {
      const g = m.get(p.gen) || { gen: p.gen, total: 0, alive: 0, dead: 0, lifespan: 0, vit: 0, cur: 0, firstBorn: Infinity };
      g.total++; if (p.died === null) g.alive++; else { g.dead++; g.lifespan += p.died - p.born; }
      g.vit += G.express(p, 'vitality'); g.cur += G.express(p, 'curiosity'); g.firstBorn = Math.min(g.firstBorn, Math.floor(p.born));
      m.set(p.gen, g);
    }
    return [...m.values()].sort((a, b) => a.gen - b.gen).map((g) => ({ gen: g.gen, total: g.total, alive: g.alive, dead: g.dead, meanLifespan: g.dead ? Math.round(g.lifespan / g.dead) : null, vitality: r2(g.vit / g.total), curiosity: r2(g.cur / g.total), firstBorn: g.firstBorn }));
  }
  summary({ hour = 12, day = 1 } = {}) {
    const people = this.alive(), fx = T.effects(this.unlocked), n = people.length;
    const power = n * this.config.populationScale * fx.epc;
    const season = this.year - Math.floor(this.year);
    const f = this.focus();
    const mirrorPeople = people.slice().sort((a, b) => (b.lineage - a.lineage) || (a.born - b.born)).slice(0, 48).map((p) => {
      const type = p.id === this.focusId && hour >= 8.5 && hour < 18 && !(hour >= 12 && hour < 13) ? 'work' : P.scheduleType(hour, this.age(p), { belief: p.belief, sick: !!p.sick, extraversion: G.express(p, 'extraversion') });
      const cand = this.places.filter((q) => q.type === type);
      const own = type === 'home' ? p.home : type === 'work' ? p.work : null;
      const place = (own && this.places.find((q) => q.id === own)) || cand[(parseInt(p.id.slice(1), 10) * 7) % Math.max(1, cand.length)] || this.places[0];
      return { id: p.id, name: p.name, place: place?.id, type, focus: p.id === this.focusId, lineage: p.lineage, stage: stageOf(this.age(p)), sick: !!p.sick, age: Math.floor(this.age(p)) };
    });
    return {
      year: r2(this.year), yearInt: Math.floor(this.year), season: r2(season), config: this.config, configSpec: CONFIG_SPEC,
      population: n, counters: this.counters, causes: this.causes, ended: !this.focusId,
      focus: this.personView(f), env: this.env, econ: { ...this.econ, gini: this.gini(people), meanWealth: n ? r2(people.reduce((s, p) => s + p.wealth, 0) / n) : 0 },
      civ: { ...this.civ, era: T.ERAS[fx.era], eraIndex: fx.era, K: T.kardashev(power), power, unlocked: this.unlocked, research: r2(this.research), next: T.available(this.unlocked).sort((a, b) => a.cost - b.cost).slice(0, 3).map((t) => ({ id: t.id, name: t.name, cost: t.cost })), districts: this.districts({ hour, day }) },
      social: this.socialView(),
      beliefs: Object.fromEntries(Object.keys(BELIEFS).map((k) => [BELIEFS[k], people.filter((p) => p.belief === k).length])),
      clans: Object.entries(people.reduce((m, p) => { m[p.name[0]] = (m[p.name[0]] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
      history: this.history.slice(-160), events: this.events.slice(-80), worldEvents: this.events.filter((e) => !['birth', 'death', 'union', 'succession', 'genesis'].includes(e.type)).slice(-40), generations: this.generations(), family: this.familyTree(),
      mirror: { places: this.places, people: mirrorPeople, weather: P.weatherAt(this.seed + this.branchSeed, day, hour, this.env.anomaly, season), sun: P.sunAt(hour, season), hour, day },
      maxGen: n ? Math.max(...people.map((p) => p.gen)) : Math.max(0, ...Object.values(this.persons).map((p) => p.gen)),
    };
  }
}
module.exports = { Society, DEFAULTS, CONFIG_SPEC, clampConfig, stageOf, BELIEFS };
