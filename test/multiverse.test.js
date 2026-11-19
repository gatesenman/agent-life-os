'use strict';
// 平行世界与"终极公式"测试：可复现、分叉、并发、隔离、从快照分叉、跨世界审批
const assert = require('assert');
const os = require('os'); const path = require('path'); const fs = require('fs');
for (const k of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'ALOS_PAYMENT', 'ALOS_EMAIL', 'ALOS_PHONE', 'ALOS_WORLD']) delete process.env[k];
const { AgentEngine } = require('../core/engine');
const { Multiverse } = require('../core/multiverse');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alos-mv-'));
const texts = (eng) => eng.timeline.filter((e) => e.kind !== 'human').map((e) => `${e.kind}|${e.clock}|${e.text}`);

(async () => {
  // L6 可复现：同种子 + 同输入 → 同轨迹
  const mk = async () => { const e = new AgentEngine({ seed: 'repro', dataDir: tmp() }); await e.init(); e.on('approval', (ap) => e.reject(ap.id)); for (let i = 0; i < 40; i++) await e.step(); return e; };
  const a = await mk(), b = await mk();
  assert.deepStrictEqual(texts(a), texts(b), '同种子同输入应得到完全相同的轨迹');
  console.log('✓ L6 可复现：两次独立运行 40 步轨迹完全一致');

  // 从快照继续（不换分支种子）应与原世界逐步一致
  const mv = new Multiverse({ dataDir: tmp(), seed: 'mv', tickMs: 5, autostart: false });
  const w0 = await mv.genesis();
  w0.on('approval', (ap) => w0.reject(ap.id));
  for (let i = 0; i < 20; i++) await w0.step();
  const replay = await mv.fork('w0', { atStep: 10, branchSeed: '', name: '重放' });
  replay.on('approval', (ap) => replay.reject(ap.id));
  assert.strictEqual(replay.stats.steps, 10);
  const balAt10 = w0.snapshots.find((s) => s.step === 10).balance;
  assert.strictEqual(replay.adapters.payment.balance, balAt10, '从快照分叉应恢复当时的余额');
  for (let i = 0; i < 10; i++) await replay.step();
  const tail = (e) => e.timeline.filter((x) => x.step >= 10 && x.step < 20 && !x.inherited && ['thought', 'action', 'result', 'money'].includes(x.kind)).map((x) => x.text);
  assert.deepStrictEqual(tail(replay), tail(w0), '同分支种子从快照重放应与原世界一致');
  console.log('✓ 从第 10 步快照重放 10 步，与原世界逐条一致');

  // 换分支种子 + 改性格 → 分歧；并发运行；隔离
  const before = w0.adapters.payment.balance, w0steps = w0.stats.steps;
  const alt = await mv.fork('w0', { name: '节俭的平行自我', branchSeed: 'alt-1', genome: { frugality: 0.95 }, policy: { dailyCapUsd: 3 } });
  const alt2 = await mv.fork('w0', { name: '挥霍的平行自我', branchSeed: 'alt-2', genome: { frugality: 0.05 }, policy: { autoApproveBelowUsd: 20 } });
  assert.strictEqual(alt.dna.genome.frugality, 0.95); assert.strictEqual(alt.policy.dailyCapUsd, 3);
  for (const w of [alt, alt2]) { w.on('approval', (ap) => w.reject(ap.id)); w.start(); }
  await new Promise((r) => setTimeout(r, 1500));
  mv.stopAll();
  assert.ok(alt.stats.steps > w0steps + 5 && alt2.stats.steps > w0steps + 5, '两个分支应并发推进');
  assert.strictEqual(w0.stats.steps, w0steps, '源世界不受分支影响（未运行）');
  assert.strictEqual(w0.adapters.payment.balance, before, '源世界余额不受分支影响');
  assert.notDeepStrictEqual(texts(alt).slice(-15), texts(alt2).slice(-15), '不同分支应产生分歧');
  for (const w of [w0, replay, alt, alt2]) assert.strictEqual(w.violations.length, 0, `${w.meta.name} 违反定律：${JSON.stringify(w.violations[0])}`);
  console.log(`✓ 两个分支并发运行（${alt.stats.steps} / ${alt2.stats.steps} 步），彼此分歧，源世界不受影响，全部世界无定律违反`);

  // 跨世界审批路由
  const mv2 = new Multiverse({ dataDir: tmp(), seed: 'ap', autostart: false });
  const m0 = await mv2.genesis(); const m1 = await mv2.fork('w0', { name: 'B' });
  await m1.requestPayment({ amount: 1.5, merchant: 'World Shop', memo: '虚拟咖啡', itemId: 'item-coffee' });
  const ap = mv2.allApprovals()[0];
  assert.strictEqual(ap.worldId, 'w1'); const b1 = m1.adapters.payment.balance;
  await mv2.approve(ap.id);
  assert.strictEqual(m1.adapters.payment.balance, +(b1 - 1.5).toFixed(2)); assert.strictEqual(m0.stats.spent, 0);
  const s = mv2.summary(); assert.strictEqual(s.worlds.length, 2); assert.strictEqual(s.worlds[1].parentId, 'w0');
  console.log('✓ 审批按世界路由，只扣对应世界的钱；多元宇宙摘要含父子关系');

  // 续存：关闭应用再打开，所有世界、钱包、法则、待审批与步数都恢复，并可继续运行
  const dir = tmp(); const desk = () => ({ id: 'sandbox', kind: 'sandbox', name: '内置沙盒桌面' });
  const pa = new Multiverse({ dataDir: dir, autostart: false, desktopFor: desk });
  const p0 = await pa.genesis(); for (let i = 0; i < 25; i++) await p0.step();
  p0.lifeConfig({ diseaseRate: 0.2 }); await pa.fork('w0', { name: '续存分支' }); for (let i = 0; i < 5; i++) await pa.get('w1').step();
  p0.world.hunger = 0.8; for (let i = 0; i < 120 && !pa.allApprovals().length; i++) await p0.step();
  const snap = (m) => JSON.stringify({ w: [...m.worlds.values()].map((x) => [x.meta.worldId, x.meta.name, x.stats.steps, x.adapters.payment.balance, x.persona.name, x.world.clock(), x.society.config.diseaseRate]), ap: m.allApprovals().map((a) => a.id) });
  const saved = snap(pa); assert.ok(pa.allApprovals().length === 1, '应有一笔待审批'); pa.save(); pa.stopAll();
  const pb = new Multiverse({ dataDir: dir, autostart: false, desktopFor: desk });
  assert.strictEqual(await pb.resume(), true); assert.strictEqual(snap(pb), saved, '续存前后状态应一致');
  await pb.approve(pb.allApprovals()[0].id); const q0 = pb.get('w0'); for (let i = 0; i < 60 && q0.desktop.os.orders.at(-1)?.status !== 'eaten'; i++) await q0.step();
  assert.strictEqual(q0.desktop.os.orders.at(-1).status, 'eaten', '续存后批准的外卖应能送达'); for (const w of pb.worlds.values()) assert.deepStrictEqual(w.violations, []);
  assert.strictEqual(await new Multiverse({ dataDir: tmp() }).resume(), false, '没有存档时应返回 false');
  console.log(`✓ 续存：重启后 ${pb.worlds.size} 个世界、钱包、法则、待审批与步数完全恢复，批准后外卖照常送达，零违反`);
  console.log('平行世界测试全部通过');
  process.exit(0);
})().catch((e) => { console.error('✗', e); process.exit(1); });
