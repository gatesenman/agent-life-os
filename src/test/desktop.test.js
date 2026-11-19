'use strict';
// 智能体桌面：内置沙盒端到端（饿 → 打开外卖 → 选菜 → 申请审批 → 批准后支付 → 订单记账 → 饥饿下降），
// 拒绝 / 策略拒绝路径、定律 L17/L18、录像、可复现，以及模拟视觉 LLM 驱动沙盒与真实 VNC（本机能启动时）。
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
const { spawnSync, execSync } = require('child_process');
const { AgentEngine } = require('../core/engine');
const { checkInvariants } = require('../core/formula');
const { ACTION_TYPES } = require('../core/desktop/session');
const SANDBOX = { id: 'sandbox', kind: 'sandbox', name: '内置沙盒桌面' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), 'alos-dt-' + p + '-'));
const ok = (m) => console.log('✓ ' + m);
delete process.env.OPENAI_MODEL; delete process.env.OPENAI_BASE_URL; delete process.env.OPENAI_API_KEY;

async function engine(tag, opts = {}) {
  const e = new AgentEngine({ dataDir: opts.dataDir || tmp(tag), seed: opts.seed || 'demo-aurora', desktop: SANDBOX });
  await e.init(); e.world.hunger = opts.hunger ?? 0.7; if (opts.perTx) e.policy.perTxCapUsd = opts.perTx;
  return e;
}
const pending = (e) => e.approvals.filter((a) => a.desktop && a.desktop.kind === 'order');

async function e2eApprove() {
  const e = await engine('ok');
  let approved = null; const h0 = e.world.hunger;
  for (let i = 0; i < 80; i++) {
    await e.step();
    const p = pending(e)[0];
    if (p && !approved) { approved = p; assert.ok(/外卖订单 WM\d+/.test(p.memo)); assert.strictEqual(p.merchant, '速达外卖'); assert.strictEqual(e.adapters.payment.summary().ledger.filter((t) => t.amount < 0).length, 0, '批准前不得扣款'); await e.approve(p.id); }
    const o = e.desktop.os.orders[0]; if (o && o.status === 'eaten') break;
  }
  assert.ok(approved, '应发起外卖支付审批');
  const o = e.desktop.os.orders[0];
  assert.strictEqual(o.status, 'eaten', '订单应被送达并确认收货');
  const led = e.adapters.payment.summary().ledger; const spend = led.find((t) => t.amount < 0 && (t.memo || '').includes(o.id));
  assert.ok(spend && Math.abs(spend.amount + o.total) < 1e-9, '订单金额应记入流水');
  assert.strictEqual(spend.ref, o.tx, '订单与流水凭证一致');
  assert.ok(e.world.hunger < h0 - 0.25, `饥饿应下降（${h0} → ${e.world.hunger}）`);
  assert.ok(e.timeline.some((x) => x.kind === 'life' && /吃完了外卖/.test(x.text)));
  assert.deepStrictEqual(e.violations, [], JSON.stringify(e.violations));
  for (const a of e.desktop.actions) assert.ok(ACTION_TYPES.includes(a.action.type), a.action.type);
  assert.ok(e.desktop.actions.filter((a) => a.action.type === 'click').every((a) => Number.isFinite(a.action.x) && Number.isFinite(a.action.y) && !a.action.target), '只能用坐标点击');
  // 录像
  const recs = e.desktop.listRecordings(); assert.ok(recs.length >= 1); const r = e.desktop.getRecording(recs.find((x) => /外卖/.test(x.goal)).id);
  assert.ok(r.steps.length >= 6 && r.steps[0].frame.nodes.length > 10, '录像应包含逐步画面');
  assert.ok(fs.existsSync(path.join(e.desktop.recordDir, r.id + '.json')), '录像落盘');
  ok(`沙盒端到端：饥饿 ${Math.round(h0 * 100)}% → 打开外卖 → ${o.shop}「${o.items.map((x) => x.name).join('、')}」→ 审批 → 支付 $${o.total} → 送达 → 用餐，饥饿 ${Math.round(e.world.hunger * 100)}%，定律 0 违反，录像 ${recs.length} 段`);
  // 继续生活：钱、日记、休息
  for (let i = 0; i < 120; i++) { await e.step(); for (const p of pending(e)) await e.approve(p.id); }
  const kinds = new Set(e.desktop.listRecordings().map((x) => x.goal));
  assert.ok([...kinds].some((g) => /零工|赚钱/.test(g)), '应去接零工');
  assert.ok(e.stats.earned > 0, '零工应带来收入');
  assert.deepStrictEqual(e.violations, []);
  ok(`之后继续生活：目标 ${[...kinds].join(' / ')}，收入 $${e.stats.earned}`);
  return e;
}

async function rejectPath() {
  const e = await engine('rej'); let rejected = false;
  for (let i = 0; i < 60; i++) { await e.step(); const p = pending(e)[0]; if (p && !rejected) { e.reject(p.id); rejected = true; } if (rejected && e.desktop.os.orders[0]?.status === 'cancelled' && i > 2) break; }
  const o = e.desktop.os.orders[0]; assert.ok(rejected); assert.strictEqual(o.status, 'cancelled');
  assert.strictEqual(e.adapters.payment.summary().ledger.filter((t) => t.amount < 0).length, 0, '拒绝后不得扣款');
  assert.ok(e.world.hunger >= 0.69, '没吃到饭，饥饿不应下降');
  for (let i = 0; i < 20; i++) await e.step();
  assert.strictEqual(pending(e).length, 0, '拒绝后冷静期内不应再次请求付款'); assert.ok(/拒绝了外卖/.test(e.desktop.goal?.why || e.desktop.mem.rejectAt != null ? '拒绝了外卖' : ''), '应进入冷静期');
  assert.deepStrictEqual(e.violations, []);
  ok('拒绝支付：订单取消、无扣款、饥饿不下降；之后 90 分钟冷静期内不再追问');
}

async function denyPath() {
  const e = await engine('deny', { perTx: 2 });
  for (let i = 0; i < 40 && !e.desktop.os.orders[0]; i++) await e.step();
  const o = e.desktop.os.orders[0]; assert.ok(o); assert.strictEqual(o.status, 'denied');
  assert.strictEqual(e.approvals.length, 0, '策略拒绝的支付不进入审批队列');
  assert.strictEqual(e.adapters.payment.summary().ledger.filter((t) => t.amount < 0).length, 0);
  assert.deepStrictEqual(e.violations, []);
  ok('预算策略拒绝（单笔上限 $2）：订单标记被拒，无扣款');
}

async function lawsCatchTampering() {
  const e = await engine('law');
  for (let i = 0; i < 20 && !pending(e).length; i++) await e.step();
  const prev = { time: e.world.absMinutes(), society: e.society.probe(), hunger: e.world.hunger };
  e.desktop.os.orders[0].status = 'paid'; // 篡改：没有流水的“已支付”订单
  assert.ok(checkInvariants(e, prev).some((v) => v.law === 'L18'), 'L18 应发现无流水的已支付订单');
  e.desktop.os.orders[0].status = 'awaiting';
  e.world.hunger = 0.2; // 篡改：没吃饭饥饿却下降
  assert.ok(checkInvariants(e, prev).some((v) => v.law === 'L17'), 'L17 应发现无进食的饥饿下降');
  e.world.hunger = prev.hunger; e.lastDesktopAction = { type: 'teleport' };
  assert.ok(checkInvariants(e, prev).some((v) => v.law === 'L18'), 'L18 应发现非键鼠动作');
  ok('定律 L17 代谢律 / L18 人机边界能抓住篡改');
}

async function takeoverAndRepro() {
  const e = await engine('tk'); for (let i = 0; i < 3; i++) await e.step();
  e.setTakeover(true); const n = e.desktop.actions.length; await e.step(); assert.strictEqual(e.desktop.actions.length, n, '接管时智能体不得动作');
  const r = await e.desktopHumanAct({ type: 'click', x: 762, y: 762 }); assert.ok(r.ok && e.desktop.os.win('notes'), '人工点击程序坞记事本应打开记事本');
  e.setTakeover(false);
  const trace = async () => { const x = await engine('rp' + Math.random(), { seed: 'repro-seed' }); for (let i = 0; i < 30; i++) { await x.step(); for (const p of pending(x)) await x.approve(p.id); } return x.desktop.actions.map((a) => JSON.stringify(a.action) + a.result).join('|'); };
  assert.strictEqual(await trace(), await trace(), 'L6：同种子同输入得到同样的电脑操作轨迹');
  ok('接管：智能体暂停、人工坐标点击生效；可复现：同种子轨迹一致');
}

// ---------- 模拟视觉 LLM（OpenAI 兼容） ----------
function mockLLM(handler) {
  return new Promise((resolve) => {
    const calls = [];
    const srv = http.createServer((req, res) => {
      let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
        const j = JSON.parse(b); calls.push(j); const out = handler(j, calls.length);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, calls, url: `http://127.0.0.1:${srv.address().port}/v1` }));
  });
}
const userText = (j) => { const c = j.messages[1].content; return typeof c === 'string' ? c : c.find((x) => x.type === 'text').text; };

async function llmSandbox() {
  // 只读屏幕文字描述里的矩形，按坐标点击「速达外卖」桌面图标
  const m = await mockLLM((j) => {
    const t = userText(j); const line = t.split('\n').find((l) => /^- button · 速达外卖 · /.test(l));
    const [x, y, w, h] = line.split(' · ').pop().split(',').map(Number);
    return { thought: '饿了，先打开外卖 App。', step: 'open', action: { type: 'double_click', x: x + w / 2, y: y + h / 2 } };
  });
  process.env.OPENAI_BASE_URL = m.url; process.env.OPENAI_MODEL = 'mock-vision';
  try {
    const e = await engine('llm'); await e.step();
    assert.strictEqual(m.calls.length, 1); assert.ok(m.calls[0].messages[0].content.includes('request_payment'), '系统提示要求付款前申请审批');
    assert.strictEqual(e.desktop.os.win('browser')?.url, 'waimai.sandbox'); assert.strictEqual(e.desktop.lastAction.source, 'llm');
    ok('模拟视觉 LLM 读屏幕元素坐标，双击打开了沙盒里的速达外卖');
  } finally { delete process.env.OPENAI_BASE_URL; delete process.env.OPENAI_MODEL; m.srv.close(); }
}

async function realVnc() {
  const has = (c) => spawnSync('bash', ['-lc', `command -v ${c}`]).status === 0;
  if (!has('Xvfb') || !has('x11vnc') || !(has('google-chrome') || has('chromium') || has('chromium-browser'))) { console.log('- 跳过真实 VNC：本机缺少 Xvfb / x11vnc / Chrome（说明见设计文档 14.6）'); return; }
  const D = '58', PORT = 5958, PASS = 'alostest';
  execSync(`bash ${path.join(__dirname, '..', 'scripts', 'vnc-demo.sh')} stop ${D}; bash ${path.join(__dirname, '..', 'scripts', 'vnc-demo.sh')} ${D} ${PORT} ${PASS}`, { stdio: 'ignore' });
  const { testVnc } = require('../core/desktop/rfb');
  try {
    const bad = await testVnc({ host: '127.0.0.1', port: PORT, password: 'wrong' }); assert.ok(!bad.ok && /认证失败/.test(bad.error), '错误密码应被拒绝');
    const t = await testVnc({ host: '127.0.0.1', port: PORT, password: PASS }); assert.ok(t.ok, t.error); assert.strictEqual(t.width, 1280);
    // 模拟视觉 LLM：收到真实截图（PNG），点击“加入购物车”，再申请支付
    const m = await mockLLM((j, n) => {
      const c = j.messages[1].content; assert.ok(Array.isArray(c) && /^data:image\/png;base64,/.test(c[1].image_url.url), '应把 VNC 截图发给视觉模型');
      if (n === 1) return { thought: '看到演示商店，点第一个加入购物车。', step: 'act', action: { type: 'click', x: 540, y: 188 } };
      return { thought: '要付款，先申请审批。', step: 'verify', action: { type: 'request_payment', amount: 1.5, merchant: 'VNC 演示店', memo: 'VNC 演示订单' } };
    });
    process.env.OPENAI_BASE_URL = m.url; process.env.OPENAI_MODEL = 'mock-vision';
    try {
      const e = new AgentEngine({ dataDir: tmp('vnc'), seed: 'demo-aurora', desktop: { id: 'vnc-t', kind: 'vnc', name: '测试 VNC', host: '127.0.0.1', port: PORT, password: PASS } });
      await e.init(); assert.strictEqual(e.desktop.driver.status.state, 'connected');
      await e.step(); const a1 = e.desktop.lastAction; assert.strictEqual(a1.action.type, 'click'); assert.ok(a1.verify && a1.verify.ok, `点击后屏幕应变化：${a1.verify?.text}`);
      await e.step(); assert.strictEqual(e.approvals.length, 1, 'VNC 上的购买也必须进入审批'); assert.strictEqual(e.approvals[0].merchant, 'VNC 演示店');
      assert.deepStrictEqual(e.violations, []);
      ok(`真实 VNC（Xvfb + x11vnc + Chrome，RFB ${t.version}，${t.security}）：截图 → 模拟视觉模型 → 坐标点击生效（屏幕变化）→ 付款申请进入审批`);
      e.desktop.unbind(); m.srv.close();
    } finally { delete process.env.OPENAI_BASE_URL; delete process.env.OPENAI_MODEL; }
  } finally { execSync(`bash ${path.join(__dirname, '..', 'scripts', 'vnc-demo.sh')} stop ${D}`, { stdio: 'ignore' }); }
}

(async () => {
  await e2eApprove(); await rejectPath(); await denyPath(); await lawsCatchTampering(); await takeoverAndRepro(); await llmSandbox(); await realVnc();
  console.log('✓ 智能体桌面测试全部通过'); process.exit(0);
})().catch((e) => { console.error('✗', e); process.exit(1); });
