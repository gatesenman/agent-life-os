'use strict';
// 社交对话、信息传播、与虚拟人谈话、文明密度：定律零违反、可复现、因果可追溯
const assert = require('assert');
const os = require('os'); const path = require('path'); const fs = require('fs');
for (const k of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'ALOS_PAYMENT', 'ALOS_EMAIL', 'ALOS_PHONE', 'ALOS_WORLD']) delete process.env[k];
const { Society } = require('../core/life/society');
const { generateDNA } = require('../core/dna');
const { buildPersona } = require('../core/persona');
const { AgentEngine } = require('../core/engine');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alos-social-'));
const mkSoc = (seed, config = {}) => { const dna = generateDNA(seed); return new Society({ seed, dna, persona: buildPersona(dna), config }); };
function run(s, years, step = 0.25) { let viol = []; for (let y = 0; y < years; y += step) { const pr = s.probe(); s.advance(step, { hour: 10, day: 1 }); viol = viol.concat(s.checkLaws(pr)); } return viol; }

(async () => {
  const s = mkSoc('agora');
  const v = run(s, 40);
  assert.deepStrictEqual(v, [], '社交层推进不应违反定律：' + JSON.stringify(v.slice(0, 3)));
  assert.ok(s.counters.talks > 0, '40 年内居民应发生对话，实际 ' + s.counters.talks);
  assert.ok(s.intel.length > 0, '应有在流传的见闻');
  const sv = s.socialView();
  assert.ok(sv.circulation >= 0 && sv.circulation <= 1);
  assert.ok(sv.literacy >= 0 && sv.literacy <= 1);
  assert.ok(sv.directory.some((p) => p.focus), '名册应包含主角');
  const districts = s.districts({ hour: 10 });
  assert.ok(districts.length >= 1, '地点应聚集成街区');
  assert.ok(districts.every((d) => d.places.length >= 1 && Number.isFinite(d.population)));
  console.log(`✓ 社交演化：40 年对话 ${s.counters.talks} 次，传闻 ${s.counters.rumors}，在传见闻 ${s.intel.length}，流通 ${sv.circulation}，街区 ${districts.length}，定律违反 0`);

  const a = mkSoc('agora'), b = mkSoc('agora');
  run(a, 25); run(b, 25);
  assert.deepStrictEqual(a.serialize(), b.serialize());
  const mid = Society.restore(a.serialize());
  run(a, 15); run(mid, 15);
  assert.deepStrictEqual(mid.serialize(), a.serialize());
  console.log('✓ 社交层可复现：同种子轨迹一致，快照恢复后续 15 年与原轨迹一致');

  const g = mkSoc('dialogue');
  run(g, 5);
  const hero = g.focus();
  const rec = g.talkTo(hero.id, '你好，今天过得怎么样？', { hunger: 0.2, balance: 10 });
  assert.ok(rec.reply && rec.source === 'human' && rec.b === hero.id);
  assert.ok(g.talks.some((t) => t.id === rec.id));
  assert.ok(g.knownBy(hero).some((i) => /观察者说/.test(i.text)));
  const food = g.talkTo(hero.id, '你饿不饿？要不要点外卖？', { hunger: 0.8, balance: 15 });
  assert.ok(/饿|外卖|批准/.test(food.reply), '主角在饥饿时应谈到吃饭与批准：' + food.reply);
  const dead = Object.values(g.persons).find((p) => p.died !== null);
  if (dead) assert.throws(() => g.talkTo(dead.id, '还能听见吗？'), /去世|必死/);
  assert.deepStrictEqual(run(g, 2), []);
  console.log(`✓ 与主角对话：答「${rec.reply.slice(0, 28)}」；饥饿追问得到回应；死者不可交谈`);

  const eng = new AgentEngine({ seed: 'talk-eng', dataDir: tmp(), autostart: false });
  await eng.init();
  const id = eng.society.focusId;
  const r = eng.talkTo(id, '记住，花钱之前必须先问我。');
  assert.ok(r.reply);
  const mem = eng.memory.serialize();
  assert.ok(mem.long.some((m) => m.tag === 'talk' && /花钱之前必须先问我/.test(m.text)), '对话应写入主角长期记忆');
  assert.ok(eng.timeline.some((e) => e.kind === 'human' && /观察者对/.test(e.text)));
  const caused = eng.timeline.filter((e) => e.kind === 'life' && /观察者对/.test(e.text));
  assert.ok(caused.length && caused.every((e) => e.cause), '对话事件应引用人类输入（L3 因果）');
  assert.strictEqual(eng.violations.length, 0, JSON.stringify(eng.violations));
  console.log('✓ 引擎对话：写入记忆流，事件带因果，定律违反 0');

  // 生命轨迹不被社交随机流扰动：关闭社交前后的生育死亡由主 RNG 决定——同种子社会主计数在社交层加入后仍可复现即可
  console.log('社交与对话测试全部通过');
})().catch((e) => { console.error('✗', e); process.exit(1); });
