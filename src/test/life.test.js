'use strict';
// 世界维度体系测试：必死、遗传、多世代零违反、可复现、天启守律、镜像世界映射
const assert = require('assert');
const os = require('os'); const path = require('path'); const fs = require('fs');
for (const k of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'ALOS_PAYMENT', 'ALOS_EMAIL', 'ALOS_PHONE', 'ALOS_WORLD', 'ALOS_YEARS_PER_DAY', 'ALOS_START_ERA']) delete process.env[k];
const { Society } = require('../core/life/society');
const G = require('../core/life/genetics');
const T = require('../core/life/techtree');
const P = require('../core/life/places');
const { DIMENSIONS, NEW_LAWS } = require('../core/life/dimensions');
const { createRng } = require('../core/prng');
const { generateDNA } = require('../core/dna');
const { buildPersona } = require('../core/persona');
const { AgentEngine } = require('../core/engine');
const { Multiverse } = require('../core/multiverse');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alos-life-'));
const mkSoc = (seed, config = {}) => { const dna = generateDNA(seed); return new Society({ seed, dna, persona: buildPersona(dna), config }); };
function run(s, years, step = 1) { let viol = []; for (let y = 0; y < years; y += step) { const pr = s.probe(); s.advance(step); viol = viol.concat(s.checkLaws(pr)); } return viol; }

(async () => {
  // 1. 维度体系完整：8 大维度，每个子维度声明规则；新定律 L8–L18（L17、L18 属于智能体桌面）
  assert.strictEqual(DIMENSIONS.length, 8);
  const subs = DIMENSIONS.flatMap((d) => d.subs); assert(subs.length >= 40, '子维度应 ≥ 40');
  for (const s of subs) assert(s.rule && s.state, `${s.name} 缺少规则或状态`);
  assert.deepStrictEqual(Object.keys(NEW_LAWS), ['L8', 'L9', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18']);
  console.log(`✓ 世界维度体系：8 大维度、${subs.length} 个子维度、11 条新定律（L8–L18）`);

  // 2. 双亲遗传：无突变时每条等位基因都来自父母；有突变时突变被记录，比例符合突变率
  const r = createRng('gen-test');
  const mom = { name: '母', alleles: G.randomAlleles(r) }, dad = { name: '父', alleles: G.randomAlleles(r) };
  for (let i = 0; i < 500; i++) {
    const c = G.inherit(mom, dad, r, { mutationRate: 0 });
    for (const t of G.TRAITS) { assert(mom.alleles[t].includes(c.alleles[t][0])); assert(dad.alleles[t].includes(c.alleles[t][1])); }
    assert.strictEqual(c.mutations.length, 0);
  }
  let mut = 0; const N = 2000;
  for (let i = 0; i < N; i++) { const c = G.inherit(mom, dad, r, { mutationRate: 0.1 }); mut += c.mutations.length; assert.deepStrictEqual(G.verifyInheritance({ name: 'c', ...c }, mom, dad), []); }
  const rate = mut / (N * G.TRAITS.length * 2); assert(rate > 0.08 && rate < 0.12, `突变率 ${rate}`);
  console.log(`✓ 子代从父母各继承一条等位基因；突变率 0.1 时实测 ${rate.toFixed(3)}，且全部被记录`);

  // 3. 多世代长程运行：500 年、每年校验 L4/L8–L16，违反数 = 0
  const s = mkSoc('dynasty');
  const v = run(s, 500);
  assert.deepStrictEqual(v, [], '多世代运行不应违反任何定律：' + JSON.stringify(v.slice(0, 3)));
  const sm = s.summary();
  assert(sm.maxGen >= 6, `应至少繁衍 6 代，实际 ${sm.maxGen}`);
  assert(s.counters.births > 100 && s.counters.deaths > 100);
  console.log(`✓ 500 年多世代运行：${sm.maxGen} 代，出生 ${s.counters.births}，死亡 ${s.counters.deaths}，定律违反 0`);

  // 4. 人终有一死：所有始祖都已死亡且有死因；凡出生早于 (现在 − 寿命上限) 者全部死亡；主角也已去世并有继承
  const all = Object.values(s.persons);
  const founders = all.filter((p) => p.founder);
  assert(founders.length > 0 && founders.every((p) => p.died !== null && p.cause), '所有始祖都应已死亡并有死因');
  for (const p of all) if (p.born < s.year - s.config.maxLifespan) assert(p.died !== null, `${p.name} 超过寿命上限仍在世`);
  const hero = s.persons.p1; assert(hero.died !== null && hero.cause, '主角终将死去');
  assert(s.counters.successions >= 1, '主角去世后应有继承人');
  assert.strictEqual(Object.values(s.causes).reduce((a, b) => a + b, 0), s.counters.deaths, '死因统计应覆盖全部死亡');
  console.log(`✓ 人终有一死：始祖 ${founders.length} 人全部去世，主角死因「${hero.cause}」，继承 ${s.counters.successions} 次`);

  // 5. 寿命上限是硬约束
  const short = mkSoc('short-life', { maxLifespan: 70, selection: 0 });
  assert.deepStrictEqual(run(short, 200, 0.5), []);
  assert(short.alive().every((p) => short.age(p) <= 70.26));
  console.log('✓ 寿命上限 70 岁时无人超过上限');

  // 6. 子代确实继承父母基因（在真实人口中抽查）
  let checked = 0;
  for (const c of Object.values(s.persons)) {
    if (!c.parents) continue; const [m, f] = c.parents.map((id) => s.persons[id]); if (!m || !f) continue;
    assert.deepStrictEqual(G.verifyInheritance(c, m, f), [], `${c.name} 的基因应来自父母`);
    assert.strictEqual(c.gen, Math.max(m.gen, f.gen) + 1); checked++;
  }
  assert(checked > 50); console.log(`✓ 抽查 ${checked} 个有亲本记录的个体：基因全部来自父母，代数 = 亲本最大代数 + 1`);

  // 7. 自然选择与演化：高选择强度下，体质均值随世代上升
  const evo = (selection) => { const x = mkSoc('selection', { selection, mutationRate: 0.05 }); run(x, 400); const gs = x.generations().filter((g) => g.total >= 8); return { first: gs[0], last: gs[gs.length - 1] }; };
  const on = evo(1), off = evo(0);
  assert(on.last.vitality > on.first.vitality + 0.1, `体质应被选择：${on.first.vitality} → ${on.last.vitality}`);
  assert(on.last.vitality > off.last.vitality, '有选择时体质应高于无选择的对照组');
  console.log(`✓ 自然选择：选择强度 1 时体质均值 第 ${on.first.gen} 代 ${on.first.vitality} → 第 ${on.last.gen} 代 ${on.last.vitality}；对照组（无选择）${off.last.vitality}`);

  // 8. 可复现 + 快照恢复（L6）
  const a = mkSoc('repro'), b = mkSoc('repro'); run(a, 80); run(b, 80);
  assert.deepStrictEqual(a.serialize(), b.serialize());
  const c = mkSoc('repro'); run(c, 40); const mid = Society.restore(c.serialize()); run(c, 40); run(mid, 40);
  assert.deepStrictEqual(mid.serialize(), c.serialize());
  console.log('✓ 社会层可复现：同种子 80 年完全一致；第 40 年快照恢复后继续 40 年与原轨迹一致');

  // 9. 文明有界：科技前置完整；卡尔达肖夫由能耗计算
  for (const id of s.unlocked) assert(T.BY_ID[id].req.every((q) => s.unlocked.includes(q)));
  assert.strictEqual(sm.civ.K, T.kardashev(sm.civ.power));
  const prim = mkSoc('primitive', { startEra: 'primitive' }); assert.deepStrictEqual(run(prim, 300), []);
  assert(prim.unlocked.length > 2, '原始时代起步应能研究出新科技');
  // 强制崩溃：失去科技时依赖一并失去，仍满足前置
  prim.civ.stability = 0.1; prim.lowStability = 3; prim.collapse();
  for (const id of prim.unlocked) assert(T.BY_ID[id].req.every((q) => prim.unlocked.includes(q)));
  console.log(`✓ 文明有界：科技前置完整，K = ${sm.civ.K}（${sm.civ.era}）；崩溃后科技树仍自洽`);

  // 10. 天启（God Mode）也要守律：不能复活；瘟疫/灾害/丰收/灵感/调停后定律违反 = 0
  const g = mkSoc('god'); run(g, 30);
  assert.throws(() => g.godEvent('resurrect'), /必死律/);
  for (const t of ['plague', 'disaster', 'bounty', 'insight', 'peace']) { const pr = g.probe(); g.stepBirths = []; g.godEvent(t); assert.deepStrictEqual(g.checkLaws(pr), [], t); }
  assert.deepStrictEqual(run(g, 30), []);
  const before = P.placeEffects(g.places).mort; g.editPlace({ op: 'add', type: 'hospital', x: 10, z: 10 }); assert(P.placeEffects(g.places).mort < before, '新建医院应降低死亡风险');
  assert.throws(() => { for (const p of g.places.filter((x) => x.type === 'home')) g.editPlace({ op: 'remove', id: p.id }); }, /至少要保留/);
  console.log('✓ 天启守律：复活被拒绝；瘟疫、灾害、丰收、灵感、调停之后定律违反 0；新建医院降低死亡风险');

  // 11. 镜像世界：地点映射到真实 OSM 数据；作息、天气、太阳确定性
  const geo = P.loadGeo(); const pl = P.defaultPlaces('mirror');
  assert(geo.buildings.length > 100 && geo.source.includes('OpenStreetMap'));
  assert(pl.filter((x) => x.osm).length >= 20, '大部分地点应来自 OSM');
  for (const t of Object.keys(P.PLACE_TYPES)) assert(pl.some((x) => x.type === t), `缺少地点类型 ${t}`);
  assert.strictEqual(P.scheduleType(3, 30, {}), 'home'); assert.strictEqual(P.scheduleType(10, 30, {}), 'work'); assert.strictEqual(P.scheduleType(10, 10, {}), 'school');
  assert.deepStrictEqual(P.weatherAt('x', 3, 10, 0, 0.3), P.weatherAt('x', 3, 10, 0, 0.3));
  assert(P.sunAt(12, 0.5).altitude > 60 && P.sunAt(0, 0.5).altitude < 0, '正午太阳高、午夜在地平线下');
  const ms = s.summary({ hour: 10, day: 2 }).mirror;
  for (const p of ms.people) assert(ms.places.some((q) => q.id === p.place), '每个居民都应位于某个地点');
  console.log(`✓ 镜像世界：${pl.length} 个地点（${pl.filter((x) => x.osm).length} 个来自 OSM），作息/天气/太阳位置确定性`);

  // 12. 引擎集成：高时间压缩下主角老去、死亡、由后代接续；智能体世界 + 社会层全程零违反
  const eng = new AgentEngine({ seed: 'lineage', dataDir: tmp(), lifeOverrides: { yearsPerDay: 120 } });
  await eng.init(); eng.on('approval', (ap) => eng.reject(ap.id));
  const firstName = eng.persona.name;
  for (let i = 0; i < 220 && !eng.ended; i++) await eng.step();
  const life = eng.snapshot().life;
  assert.strictEqual(eng.violations.length, 0, '违反：' + JSON.stringify(eng.violations.slice(0, 3)));
  assert(eng.society.persons.p1.died !== null, '初代主角应已去世');
  assert(eng.ended || eng.persona.name !== firstName, '主角应由后代接续');
  assert(eng.timeline.some((e) => e.kind === 'life'));
  console.log(`✓ 引擎集成：${eng.stats.steps} 步 ≈ ${Math.floor(life.year)} 年，初代「${firstName}」死于「${eng.society.persons.p1.cause}」，现任主角 ${life.focus ? life.focus.name + '（第 ' + life.focus.gen + ' 代）' : '无（血脉断绝）'}，违反 0`);

  // 13. 平行世界可比较：分叉时改变世界法则 → 两个世界的生命史分歧，源世界不受影响
  const mv = new Multiverse({ dataDir: tmp(), seed: 'mv-life', tickMs: 5, autostart: false });
  const w0 = await mv.genesis(); w0.society.setConfig({ yearsPerDay: 60 }); w0.on('approval', (ap) => w0.reject(ap.id));
  for (let i = 0; i < 20; i++) await w0.step();
  const plague = await mv.fork('w0', { name: '瘟疫世界', branchSeed: 'plague', life: { diseaseRate: 0.3, mutationRate: 0.15 } });
  plague.on('approval', (ap) => plague.reject(ap.id));
  assert.strictEqual(plague.society.config.diseaseRate, 0.3); assert.strictEqual(w0.society.config.diseaseRate, 0.04);
  for (let i = 0; i < 60; i++) { await w0.step(); await plague.step(); }
  const bw = mv.summary().worlds;
  assert(bw.every((w) => w.life && w.violations === 0));
  assert.notDeepStrictEqual(bw[0].life.series.pop, bw[1].life.series.pop);
  console.log(`✓ 平行世界可比：主世界 ${bw[0].life.population} 人 / 瘟疫世界 ${bw[1].life.population} 人，疫情 ${w0.society.counters.epidemics} vs ${plague.society.counters.epidemics}，均零违反`);

  // 14. 生命层文本无 emoji
  // 镜像世界：OSM → 本地 ENU 米坐标的离线转换（不访问网络）
  {
    const { toCompact } = require('../core/life/geoFetch');
    const osm = { elements: [
      { type: 'node', id: 1, lat: 31.2375, lon: 121.5015 }, { type: 'node', id: 2, lat: 31.2375, lon: 121.5025 }, { type: 'node', id: 3, lat: 31.2385, lon: 121.5025 },
      { type: 'way', id: 10, nodes: [1, 2, 3, 1], tags: { building: 'yes', 'building:levels': '10', name: '测试楼' } },
      { type: 'way', id: 11, nodes: [1, 3], tags: { highway: 'primary' } },
      { type: 'node', id: 4, lat: 31.238, lon: 121.502, tags: { amenity: 'hospital', name: '测试医院' } },
      { type: 'node', id: 5, lat: 31.238, lon: 121.502, tags: { amenity: 'bench' } } ] };
    const c = toCompact(osm, 31.2375, 121.5015, [0, 0, 0, 0], '测试');
    assert.strictEqual(c.buildings.length, 1); assert.strictEqual(c.buildings[0].p.length, 3); assert.strictEqual(c.buildings[0].h, 33);
    assert(Math.abs(c.buildings[0].p[1][0] - 95.2) < 1 && c.buildings[0].p[1][1] === 0, '东向为 +x');
    assert(c.buildings[0].p[2][1] < -100, '北向为 -z');
    assert.strictEqual(c.roads.length, 1); assert.strictEqual(c.pois.length, 1); assert(/OpenStreetMap/.test(c.source));
    // 天气与太阳：确定性、不消耗世界随机数
    assert.deepStrictEqual(P.weatherAt('s', 3, 14, 0.5, 0.5), P.weatherAt('s', 3, 14, 0.5, 0.5));
    assert(P.sunAt(12, 0.5).altitude > P.sunAt(12, 0).altitude, '夏至正午太阳高于冬至');
    assert(P.sunAt(0, 0.5).altitude < 0, '午夜太阳在地平线下');
    console.log('✓ 镜像世界：OSM 离线转换（东 +x / 北 -z）、天气确定性、昼夜太阳高度');
  }
  const EMOJI = /(?![\u00A9\u00AE\u2122])[\p{Extended_Pictographic}\u{FE0F}]/u;
  assert(!EMOJI.test(JSON.stringify(s.summary())) && !EMOJI.test(JSON.stringify(DIMENSIONS)));
  console.log('✓ 生命层事件与维度文本中没有 emoji');
  console.log('世界维度体系测试全部通过');
})().catch((e) => { console.error('✗', e); process.exit(1); });
