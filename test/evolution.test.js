'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { Multiverse } = require('../core/multiverse');
const { writeSave, readSave } = require('../core/persistence');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alos-evolution-'));
async function world() { const mv = new Multiverse({ dataDir: temp(), seed: 'evolution-070', autostart: false }); await mv.genesis(); return mv; }
test('R1: 迁移v1、主档损坏恢复、双损坏保护与重复ID拒绝', async () => {
  const mv = await world(); mv.save(); const f = mv.persistFile;
  const old = JSON.parse(fs.readFileSync(f)); old.version = 1; writeSave(f, old);
  assert.equal(readSave(f).data.version, 2);
  fs.writeFileSync(f, '{broken'); assert.equal(readSave(f).recovered, true);
  const next = new Multiverse({ dataDir: mv.base.dataDir, autostart: false }); assert.equal(await next.resume(), true);
  fs.writeFileSync(f + '.bak', 'bad'); assert.equal(await next.resume(), false); assert.equal(next.save(), false);
  assert.equal(fs.readFileSync(f, 'utf8'), '{broken');
  old.worlds.push(old.worlds[0]); assert.throws(() => writeSave(f, old), /结构/);
  mv.stopAll(); next.stopAll();
});

const { BudgetPolicy } = require('../core/policy');
test('R2: 金额严格有限精确到分、旧阈值不得绕过人工审批', () => {
  const p = new BudgetPolicy({ autoApproveBelowUsd: 100, dailyCapUsd: 100 });
  for (const amount of [NaN, Infinity, -1, 0, '1', 1.001]) assert.equal(p.check({ amount }, { balance: 100 }).verdict, 'deny');
  assert.equal(p.check({ amount: 1, merchant: 'World Shop' }, { balance: 100 }).verdict, 'needs_approval');
  assert.equal(p.check({ amount: 1 }, { balance: NaN }).verdict, 'deny');
});

test('R3: 审批过期、重复批准与并发预算复核均不得误扣款', async () => {
  const mv = await world(), e = mv.active; e.policy.dailyCapUsd = 10;
  await e.requestPayment({ amount: 6, merchant: 'World Shop', memo: 'a' });
  await e.requestPayment({ amount: 6, merchant: 'World Shop', memo: 'b' });
  const ids = e.approvals.map((x) => x.id), before = e.adapters.payment.balance;
  assert.deepEqual(await Promise.all(ids.map((id) => e.approve(id))), [true, false]);
  assert.equal(e.adapters.payment.balance, before - 6); assert.equal(await e.approve(ids[0]), false);
  await e.requestPayment({ amount: 1, merchant: 'World Shop', memo: 'expired' });
  const ap = e.approvals[0]; ap.expiresAt = Date.now() - 1;
  assert.equal(await e.approve(ap.id), false); assert.equal(e.adapters.payment.balance, before - 6);
  mv.stopAll();
});

const { DesktopSession } = require('../core/desktop/session');
test('R4: 等待截图期间换绑，旧决策不得操作新电脑；取消清空审批并暂停', async () => {
  const d = new DesktopSession({ seed: 'cancel' }); await d.bind({ id: 'a', name: 'A', kind: 'sandbox' });
  let release; const observation = await d.driver.observe(); d.driver.observe = () => new Promise((r) => { release = r; });
  const job = d.tick({ absMinutes: 1 }); await d.bind({ id: 'b', name: 'B', kind: 'sandbox' });
  let acts = 0; d.driver.act = async () => { acts++; }; release(observation);
  assert.equal((await job).held, true); assert.equal(acts, 0);
  const mv = await world(), e = mv.active; e.cancelGoal(); assert.equal(e.paused, true); assert.equal(e.approvals.length, 0); mv.stopAll();
});

const { Memory } = require('../core/memory');
test('R5: 记忆有界、检索去重、角色对话引用正确且死者拒绝不留假记录', async () => {
  const m = new Memory(null); for (let i = 0; i < 520; i++) m.remember('记录' + i);
  assert.equal(m.long.length, 500); m.remember('唯一记忆'); m.remember('唯一记忆');
  assert.equal(m.retrieve('唯一记忆', 20).filter((x) => x.text === '唯一记忆').length, 1);
  const mv = await world(), e = mv.active, id = e.society.focusId;
  const first = e.talkTo(id, '我喜欢安静的雨天'); const r = e.talkTo(id, '你记得我上次说什么吗');
  assert.match(r.reply, /安静的雨天/); assert.equal(r.previousId, first.id); assert.equal(r.replySource, 'rules');
  assert.equal(e.memory.long.at(-1).personId, id);
  e.society.persons[id].died = e.society.year; const seq = e.seq;
  assert.throws(() => e.talkTo(id, '你好'), /已故/); assert.equal(e.seq, seq); mv.stopAll();
});

test('R6: 每日计划以实际结果闭环，发起审批不等于吃饭，跨日结算', () => {
  const m = new Memory(null); m.makePlan(1, { hunger: .8, balance: 5, energy: 20, personId: 'p1' });
  m.updatePlan({ payment: { amount: 2 } }, { personId: 'p1' }); assert.equal(m.plan.tasks.find((t) => t.id === 'eat').status, 'pending');
  m.updatePlan({ earn: { amount: 4 }, diary: '日记', eat: { satiety: .5 } }, { personId: 'p1', sourceId: 'w0:42' });
  assert.equal(m.plan.tasks.filter((t) => t.status === 'done').length, 3); assert.equal(m.plan.earned, 4);
  m.updatePlan({ resting: true }, { personId: 'other' }); assert.equal(m.plan.tasks.find((t) => t.id === 'rest').status, 'pending');
  m.makePlan(2, { hunger: .2, balance: 9, personId: 'p1' }); assert.match(m.long.at(-1).text, /3\/4/);
});

test('R7: 法则严格验证、版本冲突保护、只撤销规则而非世界历史', async () => {
  const mv = await world(), e = mv.active, old = e.society.config.fertility;
  for (const value of [NaN, Infinity, -1, 100, '0.1']) assert.throws(() => e.lifeConfig({ fertility: value }));
  assert.throws(() => e.lifeConfig({ startEra: 'primitive' }), /不可修改/);
  e.lifeConfig({ patch: { fertility: .1 }, expectedRevision: 0 });
  assert.equal(e.society.config.fertility, .1); assert.equal(e.configRevision, 1);
  assert.throws(() => e.lifeConfig({ patch: { fertility: .2 }, expectedRevision: 0 }), /刷新/);
  const time = e.world.absMinutes(); e.undoConfig(1); assert.equal(e.society.config.fertility, old); assert.equal(e.world.absMinutes(), time);
  assert.throws(() => e.undoConfig(2), /没有/); mv.stopAll();
});

test('R8: 图表共同年份对齐且不外推，无关世界同文本不算共同历史', async () => {
  const { alignPopulation, eventKey } = await import('../src/lib/comparison.mjs');
  const x = alignPopulation({ years: [0, 5, 10], pop: [10, 20, 30] }, { years: [3, 8], pop: [40, 50] });
  assert.equal(x.start, 3); assert.equal(x.end, 8); assert.equal(x.a[0], 10); assert.equal(x.b.at(-1), 50);
  assert.equal(alignPopulation({ years: [0, 1], pop: [1, 2] }, { years: [3, 4], pop: [3, 4] }), null);
  assert.notEqual(eventKey({ id: 'w0:4', text: '相同' }), eventKey({ id: 'w1:4', text: '相同' }));
});

test('R9: 方向键与首尾导航，循环且不会吞掉普通按键', async () => {
  const { nextOptionIndex } = await import('../src/lib/keyboard.mjs');
  assert.equal(nextOptionIndex(2, 'ArrowRight', 3), 0); assert.equal(nextOptionIndex(0, 'ArrowLeft', 3), 2);
  assert.equal(nextOptionIndex(1, 'Home', 3), 0); assert.equal(nextOptionIndex(0, 'End', 3), 2);
  assert.equal(nextOptionIndex(0, 'Tab', 3), -1); assert.equal(nextOptionIndex(0, 'ArrowRight', 0), -1);
});

test('R10: 发布门禁拒绝运行数据、私钥和服务密钥，允许空白示例配置', () => {
  const { scanText, scanFiles } = require('../scripts/audit-public');
  assert.equal(scanText('OPENAI_API_KEY=\nOPENAI_MODEL=abcdefghijklmnop').length, 0);
  assert.ok(scanText('ghp_' + 'a'.repeat(30)).includes('github-token'));
  assert.ok(scanText('-----BEGIN ' + 'PRIVATE KEY-----').includes('private-key'));
  const dir = temp(); fs.writeFileSync(path.join(dir, 'multiverse.json'), '{}');
  assert.equal(scanFiles(dir, ['multiverse.json'])[0].rule, 'private-runtime-path');
});

test('集成加固: VNC批准只放行一次疑似支付，未知金额不猜测、不重复申请', () => {
  const d = new DesktopSession({ seed: 'payment' }); d.driver = { kind: 'vnc' }; d.target = { name: '测试机' };
  const click = { thought: '确认支付', action: { type: 'click', x: 1, y: 1 } };
  assert.equal(d.maybeInterceptPayment(click, { text: '确认支付' }, {}).intercept, 'unknown-amount');
  assert.equal(d.maybeInterceptPayment(click, { text: '确认支付 $9.00' }, {}).action.type, 'request_payment');
  assert.equal(d.maybeInterceptPayment({ action: { type: 'request_payment', amount: 9 } }, {}, {}).action.type, 'wait');
  d.onPayment({ kind: 'vnc' }, 'paid', { tx: 'test' });
  assert.equal(d.maybeInterceptPayment(click, { text: '确认支付 $9.00' }, {}).action.type, 'click');
  assert.equal(d.maybeInterceptPayment(click, { text: '确认支付 $9.00' }, {}).action.type, 'request_payment');
});
