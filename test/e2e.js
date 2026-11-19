'use strict';
// 端到端测试：用 Playwright 驱动真实的 Electron 窗口，像一个新用户那样点击界面完成全部旅程。
// 用法：npm run e2e    （Linux 无显示器时自动启动 Xvfb；E2E_SOAK_MS 控制长跑时长，默认 600000 = 10 分钟）
// 产物：docs/e2e/*.png（每步截图）、docs/e2e/journey.gif（旅程录像）、docs/e2e/results.json（步骤表与健康数据）
const { _electron } = require('playwright');
const electron = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn, execSync, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const OUT = path.join(root, 'docs', 'e2e');
const SOAK_MS = Number(process.env.E2E_SOAK_MS ?? 600000);
const SOAK_LABEL = SOAK_MS >= 60000 ? `${Math.round(SOAK_MS / 60000)} 分钟` : `${Math.round(SOAK_MS / 1000)} 秒`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alos-e2e-'));
const USER_DATA = path.join(tmp, 'userdata'), DATA = path.join(tmp, 'agents'), VIDEO = path.join(tmp, 'video');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const results = []; const health = { console: [], pageErrors: [], mainStderr: [], samples: [], crashes: [], copy: [], deadButtons: [] };
let app, page, shotN = 0, currentPhase = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---------- 显示器 ----------
let xvfb = null;
if (process.platform === 'linux' && process.env.E2E_USE_DISPLAY !== '1') { // 默认用独立 Xvfb（可录屏、不干扰桌面）；E2E_USE_DISPLAY=1 则用当前显示器
  const D = ':93'; xvfb = spawn('Xvfb', [D, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  process.env.DISPLAY = D; spawnSync('sleep', ['1.5']);
}

// ---------- 模拟视觉模型（只在 VNC 阶段启用） ----------
function mockLLM() {
  return new Promise((resolve) => {
    let n = 0; const calls = [];
    const srv = http.createServer((req, res) => {
      let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
        let out; try {
          const j = JSON.parse(b); const c = j.messages[1].content; const img = Array.isArray(c) && c.some((x) => x.type === 'image_url');
          if (!img) out = { thought: '（沙盒：E2E 第三段只测 VNC，先等待）', step: 'wait', action: { type: 'wait', minutes: 1 } };
          else { n++; calls.push(n); out = n === 1 ? { thought: '看到演示商店，点第一个加入购物车。', step: 'act', action: { type: 'click', x: 540, y: 188 } }
            : n === 2 ? { thought: '要付款，先申请审批。', step: 'verify', action: { type: 'request_payment', amount: 1.5, merchant: 'VNC 演示店', memo: 'VNC 演示订单' } }
            : { thought: '等待守护者审批。', step: 'wait', action: { type: 'wait', minutes: 2 } }; }
        } catch { out = { thought: 'parse', action: { type: 'wait', minutes: 1 } }; }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, calls, url: `http://127.0.0.1:${srv.address().port}/v1` }));
  });
}

// ---------- 启动 / 关闭 ----------
async function launch(extraEnv = {}, tag = '') {
  const env = { ...process.env, ALOS_E2E: '1', ALOS_NO_SANDBOX: '1', ALOS_TICK_MS: '300', ALOS_USER_DATA: USER_DATA, ALOS_DATA_DIR: DATA, ...extraEnv };
  for (const k of ['ALOS_SMOKE', 'ALOS_SEED', 'ALOS_FRESH', 'VITE_DEV']) delete env[k];
  if (!extraEnv.OPENAI_BASE_URL) { env.OPENAI_BASE_URL = ''; env.OPENAI_MODEL = ''; env.OPENAI_API_KEY = ''; }
  app = await _electron.launch({ executablePath: electron, args: [root], env, timeout: 60000 });
  app.process().stderr.on('data', (d) => { const t = String(d); if (/error|exception|uncaught/i.test(t) && !/dbus|gpu|GLES|viz|Fontconfig|libva|ALSA|swiftshader|vaapi|SharedImage/i.test(t)) health.mainStderr.push(`[${tag}] ${t.trim().slice(0, 300)}`); });
  app.on('close', () => {});
  page = await app.firstWindow();
  page.on('console', (m) => { if (m.type() === 'error') health.console.push(`[${tag}/${currentPhase}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => health.pageErrors.push(`[${tag}/${currentPhase}] ${e.message.slice(0, 300)}`));
  page.on('crash', () => health.crashes.push(`[${tag}/${currentPhase}] renderer crashed`));
  await page.setViewportSize?.({ width: 1600, height: 960 }).catch(() => {});
  await page.waitForSelector('.sidebar, .modal', { timeout: 60000 });
  return app;
}
async function close() { await app.close(); } // 走真实退出路径：关闭窗口 → window-all-closed → 写盘
// 录屏：直接抓 Xvfb 画面（Playwright 的 Electron 录像会让 GPU 合成失败，故不用）
let rec = null;
function recStart() { if (!xvfb) return; fs.mkdirSync(VIDEO, { recursive: true }); rec = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-framerate', '5', '-video_size', '1600x960', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(VIDEO, 'journey.mp4')], { stdio: ['pipe', 'ignore', 'ignore'] }); }
function recStop() { return new Promise((r) => { if (!rec) return r(); rec.on('exit', r); rec.stdin.write('q'); setTimeout(r, 5000); }); }

// ---------- 主进程读取（只读断言 + 模拟时间流逝） ----------
const M = async (fn, arg) => { for (let i = 0; ; i++) { try { return await app.evaluate(fn, arg); } catch (e) { if (i < 3 && /garbage collected|Execution context/.test(e.message)) { await sleep(200); continue; } throw e; } } };
const W = () => M(() => { const mv = global.__alos.mv; const w = mv.active; const d = w.desktop; return {
  id: w.meta.worldId, name: w.persona.name, steps: w.stats.steps, balance: w.adapters.payment.balance, hunger: w.world.hunger, energy: w.world.energy,
  ledger: w.adapters.payment.ledger.map((t) => ({ id: t.id, amount: t.amount, memo: t.memo })), approvals: mv.allApprovals().map((a) => ({ id: a.id, memo: a.memo, amount: a.amount, worldId: a.worldId, desktop: !!a.desktop })),
  orders: d.os.orders.map((o) => ({ id: o.id, status: o.status, total: o.total })), goal: d.goal && { kind: d.goal.kind, title: d.goal.title }, bound: d.target?.kind || null,
  worlds: [...mv.worlds.values()].map((x) => ({ id: x.meta.worldId, name: x.meta.name, steps: x.stats.steps, balance: x.adapters.payment.balance, persona: x.persona.name, running: x.running, paused: x.paused })),
  violations: [...mv.worlds.values()].reduce((n, x) => n + x.violations.length, 0), config: w.society.config, takeover: w.takeover,
  rel: d.reliability(), trace: (() => { const t = w.traceSummary(); return t && { n: t.n, p50: t.p50, p95: t.p95, violations: t.violations, lawChecks: t.lawChecks }; })(),
  mind: { reflections: w.memory.reflections, plan: w.memory.plan?.items?.length || 0, insights: w.memory.long.filter((m) => m.tag === 'insight').length },
  lastAction: d.lastAction && { type: d.lastAction.action?.type, human: !!d.lastAction.human, source: d.lastAction.source, ok: d.lastAction.ok, verify: d.lastAction.verify?.ok },
}; });
async function until(pred, ms = 60000, every = 300) { const t0 = Date.now(); let last; while (Date.now() - t0 < ms) { last = await W(); if (await pred(last)) return last; await sleep(every); } throw new Error(`等待超时（${ms} ms）`); }

// ---------- 记录步骤 ----------
async function shot(name) { shotN++; const f = `${String(shotN).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); return f; }
async function step(name, expected, fn) {
  currentPhase = name; const t0 = Date.now(); let actual = '', pass = false, file = '';
  try { actual = (await fn()) || '符合预期'; pass = true; } catch (e) { actual = `失败：${e.message.split('\n')[0]}`; console.log(e.message.split('\n').slice(0, 12).join('\n')); try { console.log('  最近时间线：\n   ' + (await M(() => global.__alos.mv.active.timeline.filter((x) => x.kind !== 'result').slice(-10).concat(global.__alos.mv.active.timeline.filter((x) => x.kind === 'payment').slice(-4)).map((x) => `[${x.kind}] ${x.text}`.slice(0, 140)).join('\n   ')))); } catch {} }
  try { file = await shot(name.replace(/[\s/：:（）()·，,]+/g, '-').replace(/-+$/, '')); } catch {}
  results.push({ step: name, expected, actual, pass, screenshot: file, ms: Date.now() - t0 });
  log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${actual}`);
  return pass;
}
const btn = (text, scope = page) => scope.locator('button', { hasText: text }).filter({ visible: true }).first();
const nav = async (label) => { await page.locator(`.sidebar button[title="${label}"]`).first().click(); await sleep(500); };
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---------- 全局检查：死按钮、文案 ----------
async function auditView(label) {
  const r = await page.evaluate(() => {
    const out = { dead: [], unnamed: [], bad: [], english: [] };
    for (const b of document.querySelectorAll('button')) {
      if (!b.offsetParent || b.disabled) continue;
      const k = Object.keys(b).find((x) => x.startsWith('__reactProps')); const p = k ? b[k] : {};
      const name = (b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('title') || '';
      if (!p.onClick && b.type !== 'submit' && !b.closest('label')) out.dead.push(name || b.className);
      if (!name) out.unnamed.push(b.className);
    }
    const text = document.querySelector('.main')?.innerText || '';
    for (const m of text.matchAll(/(undefined|NaN|\[object Object\]|null(?![a-z]))/g)) out.bad.push(text.slice(Math.max(0, m.index - 20), m.index + 20).replace(/\n/g, ' '));
    const ok = /^(God|Mode|VNC|LLM|OSM|DNA|QEMU|UTM|RFB|Electron|Natural|Earth|Overpass|Google|Cesium|OpenAI|API|URL|Base|Chrome|Ubuntu|VirtualBox|x11vnc|TLS|VeNCrypt|SSH|BASE|MODEL|OPENAI|ALOS|KEY|TOKEN|ION|GOOGLE|CESIUM|TILES|CUA|RULES|JSON|PNG|Kardashev|Gini|Linux|Windows|macOS|Lucide|sandbox|waimai|gig|notes|diary|Agent|Life|true|false|Mock|mock|vision|sim)$/i;
    for (const m of text.matchAll(/\b[A-Za-z]{4,}\b/g)) if (!ok.test(m[0])) out.english.push(m[0]);
    out.english = [...new Set(out.english)].slice(0, 20);
    out.stuck = document.querySelectorAll('[data-motion-pop-id]').length + Math.max(0, document.querySelectorAll('.view-wrap').length - 1);
    return out;
  });
  if (r.stuck) (health.stuckExits = health.stuckExits || []).push({ view: label, n: r.stuck });
  if (r.dead.length) health.deadButtons.push({ view: label, buttons: [...new Set(r.dead)] });
  if (r.unnamed.length) health.deadButtons.push({ view: label, unnamed: [...new Set(r.unnamed)] });
  if (r.bad.length || r.english.length) health.copy.push({ view: label, bad: r.bad.slice(0, 5), english: r.english });
  return r;
}

// ---------- 资源采样 ----------
let lastCpu = null;
function cpuTicks(pids) { let t = 0; for (const p of pids) { try { const f = fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' '); t += Number(f[11]) + Number(f[12]); } catch {} } return t; }
function procTree(pid) { try { const all = execSync('ps -e -o pid=,ppid=,rss=,pcpu=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)); const keep = new Set([pid]); let grew = true; while (grew) { grew = false; for (const [p, pp] of all) if (keep.has(pp) && !keep.has(p)) { keep.add(p); grew = true; } } const mine = all.filter(([p]) => keep.has(p)); const ticks = cpuTicks(mine.map((x) => x[0])); const now = Date.now(); let cpu = null; if (lastCpu && now > lastCpu.at) cpu = Math.round(((ticks - lastCpu.ticks) / 100) / ((now - lastCpu.at) / 1000) * 100); lastCpu = { ticks, at: now }; return { rssMB: Math.round(mine.reduce((s, x) => s + x[2], 0) / 1024), cpuPct: cpu, procs: mine.length }; } catch { return null; } }
async function sample(tag) { const t = procTree(app.process().pid); let heap = null; try { heap = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)); } catch {} let mainHeap = null; try { mainHeap = await M(() => Math.round(process.memoryUsage().heapUsed / 1048576)); } catch {} const s = { at: Date.now(), tag, ...t, rendererHeapMB: heap, mainHeapMB: mainHeap }; health.samples.push(s); return s; }

// =====================================================================
(async () => {
  const t0 = Date.now();
  // ---------------- 第一段：全新用户 ----------------
  recStart();
  await launch({}, 'run1');
  await step('首次启动：出现新手引导', '全新用户数据目录下打开应用，出现 5 步引导弹窗', async () => {
    await page.waitForSelector('.modal[role=dialog]', { timeout: 20000 });
    const h = await page.locator('.modal h2').first().innerText(); return `引导弹窗出现，第 1 步标题「${h}」`;
  });
  for (let i = 2; i <= 5; i++) {
    await step(`引导第 ${i} 步`, '点「下一步」进入下一步', async () => { await btn('下一步').click(); await sleep(450); return `标题「${await page.locator('.modal h2').last().innerText()}」`; });
  }
  await step('引导完成：去看智能体桌面', '最后一步点「去看智能体桌面」，弹窗关闭并进入智能体桌面', async () => {
    await btn('去看智能体桌面').click(); await page.waitForSelector('.modal[role=dialog]', { state: 'detached', timeout: 5000 });
    await page.waitForSelector('.view.desktop', { timeout: 5000 }); return '进入智能体桌面';
  });
  await step('概览：生活仪表盘', '侧栏点「概览」，看到主角、饥饿/能量/余额与桌面预览', async () => {
    await nav('概览'); await page.waitForSelector('.view', { timeout: 5000 }); await sleep(800);
    const s = await W(); const txt = await page.locator('.main, main').first().innerText();
    expect(txt.includes(s.name), `概览里没看到主角名 ${s.name}`); await auditView('概览');
    return `主角 ${s.name}，余额 $${s.balance}，饥饿 ${Math.round(s.hunger * 100)}%，${s.worlds.length} 个世界在运行`;
  });

  // ---------------- 智能体桌面：饿了 → 点外卖 → 审批 → 批准 ----------------
  let approved = null, bal0 = 0;
  await step('智能体桌面：沙盒已绑定、直播中', '进入智能体桌面，内置沙盒桌面已绑定，屏幕在实时变化', async () => {
    await nav('智能体桌面'); await page.waitForSelector('.view.desktop');
    if (await page.locator('.dk-empty').count()) await btn('绑定内置沙盒桌面').click();
    const a = await W(); await sleep(2000); const b = await W(); expect(b.bound === 'sandbox', '沙盒未绑定'); expect(b.steps > a.steps, '世界时钟没有推进');
    await auditView('智能体桌面'); return `绑定 ${b.bound}，2 秒内推进 ${b.steps - a.steps} 步，当前目标「${b.goal?.title || '选择中'}」`;
  });
  await step('饿了：TA 自己打开外卖并下单，弹出审批', '饥饿 ≥ 60% 后智能体自己打开速达外卖、下单，右下角出现「来自电脑」的审批卡片，未扣款', async () => {
    bal0 = (await W()).balance;
    await M(() => { const w = global.__alos.mv.active; w.world.hunger = Math.max(w.world.hunger, 0.72); }); // 模拟时间流逝：饥饿上升到 72%
    const s = await until((x) => x.approvals.some((a) => a.desktop), 90000);
    await page.locator('.approvals .approval').first().waitFor({ timeout: 5000 });
    const card = await page.locator('.approvals .approval').first().innerText();
    expect(card.includes('来自电脑'), '审批卡片缺少「来自电脑」标签'); expect(Math.abs(s.balance - bal0) < 1e-6, '审批前就扣款了');
    approved = s.approvals.find((a) => a.desktop); return `订单「${approved.memo}」$${approved.amount} 等待批准，余额仍为 $${s.balance}`;
  });
  await step('批准：扣款 → 配送 → 用餐 → 饥饿下降', '点「批准」后钱包扣款、订单送达、TA 吃饭、饥饿明显下降', async () => {
    expect(approved, '前一步没有审批'); const h0 = (await W()).hunger;
    await page.locator('.approvals .approval').first().locator('button', { hasText: '批准' }).click();
    const s = await until((x) => x.orders.length && x.orders.at(-1).status === 'eaten', 120000);
    expect(s.balance < bal0 - 0.01, '没有扣款'); expect(s.hunger < h0 - 0.2, `饥饿未明显下降 ${h0} → ${s.hunger}`);
    return `扣款 $${(bal0 - s.balance).toFixed(2)}（账本 ${s.ledger.at(-1).memo}），订单 ${s.orders.at(-1).id} 已用餐，饥饿 ${Math.round(h0 * 100)}% → ${Math.round(s.hunger * 100)}%`;
  });
  await step('拒绝路径：不扣款，TA 记住教训', '再次饥饿下单后点「拒绝」，钱包余额不变、订单取消，记忆中出现教训', async () => {
    await M(() => { const w = global.__alos.mv.active; w.world.hunger = 0.75; });
    const s1 = await until((x) => x.approvals.some((a) => a.desktop), 90000); const b1 = s1.balance; const ap = s1.approvals.find((a) => a.desktop);
    await page.locator('.approvals .approval').first().locator('button', { hasText: '拒绝' }).click();
    await until((x) => !x.approvals.some((a) => a.id === ap.id), 5000);
    await sleep(1200); const s2 = await W();
    const charged = s2.ledger.filter((t) => !s1.ledger.some((q) => q.id === t.id) && t.amount < 0 && t.memo === ap.memo);
    expect(!charged.length, '拒绝后仍然扣款'); const lesson = await M(() => global.__alos.mv.active.memory.serialize().longTerm?.some?.((m) => /拒绝/.test(m.text)) ?? JSON.stringify(global.__alos.mv.active.memory.serialize()).includes('拒绝了我购买'));
    const o = s2.orders.find((x) => x.status !== 'eaten' && x.status !== 'delivered'); 
    return `拒绝「${ap.memo}」$${ap.amount}，无扣款（余额 $${b1} → $${s2.balance}，差额来自其他收支 ${(s2.balance - b1).toFixed(2)}），订单状态 ${o?.status || s2.orders.at(-1)?.status}，教训已写入记忆：${lesson ? '是' : '否'}；之后 ${s2.approvals.length} 笔新审批`;
  });
  // 处理拒绝后可能再次出现的审批（记录行为，批准一次以结束饥饿）
  await step('拒绝后的行为', '拒绝后 TA 进入 90 分钟（世界时间）冷静期，先去赚钱，不立刻再次请求', async () => {
    await sleep(1500); const s = await W(); const info = await M(() => { const w = global.__alos.mv.active; return { why: w.desktop.goal?.why || '', rejectAt: w.desktop.mem.rejectAt, now: w.world.absMinutes() }; });
    expect(info.rejectAt != null, '没有记录拒绝时间（冷静期未生效）');
    const n = s.approvals.filter((a) => a.desktop).length; const elapsed = info.now - info.rejectAt;
    expect(!n || elapsed >= 90, `拒绝后仅 ${elapsed} 世界分钟就再次请求付款`);
    if (n) { await page.locator('.approvals .approval').first().locator('button', { hasText: '批准' }).click(); await until((x) => x.orders.at(-1)?.status === 'eaten', 120000); }
    return `拒绝后进入 90 分钟冷静期：当前目标「${s.goal?.title}」（${info.why}）；已过 ${elapsed} 世界分钟${n ? '，冷静期结束后 TA 再次点餐，已批准' : '，没有再次请求'}`;
  });
  await step('钱包：收支与审批', '侧栏点「收支与审批」，看到刚才批准的外卖扣款记录', async () => {
    await nav('收支与审批'); await sleep(600); const txt = await page.locator('.main, main').first().innerText();
    expect(txt.includes(approved.memo.slice(0, 6)), `钱包页没有「${approved.memo}」`); await auditView('收支与审批');
    return `账本包含「${approved.memo}」`;
  });

  // ---------------- God Mode：改法则、天启 ----------------
  await step('开启 God Mode', '右上角点锁按钮，进入可干预模式', async () => {
    await page.locator('.lockbtn').click(); await sleep(300); expect((await page.locator('.lockbtn').getAttribute('aria-pressed')) === 'true', 'God Mode 未开启'); return 'God Mode 已开启';
  });
  await step('世界法则：缩短寿命上限、提高疫病率', '文明与环境 → 世界法则，拖动滑杆并「应用法则」，主进程配置随之改变', async () => {
    await nav('文明与环境'); await btn('世界法则').click(); await sleep(500);
    const c0 = (await W()).config;
    const life = page.locator('label.slider', { hasText: '寿命上限' }).locator('input'); await life.focus(); for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
    const dis = page.locator('label.slider', { hasText: '疫病率' }).locator('input'); await dis.focus(); for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
    await btn('应用法则').click(); await sleep(600); const c1 = (await W()).config;
    expect(c1.maxLifespan < c0.maxLifespan && c1.diseaseRate > c0.diseaseRate, `配置未改变 ${JSON.stringify(c1)}`); await auditView('世界法则');
    return `寿命上限 ${c0.maxLifespan} → ${c1.maxLifespan.toFixed(1)}，疫病率 ${c0.diseaseRate} → ${c1.diseaseRate.toFixed(3)}`;
  });
  await step('天启：降下瘟疫', '点「降下瘟疫」，出现瘟疫事件且患病人数增加，定律不被违反', async () => {
    const before = await M(() => { const so = global.__alos.mv.active.society; return Object.values(so.persons).filter((p) => p.alive !== false && !p.dead && p.sick).length; });
    await btn('降下瘟疫').click(); await sleep(800);
    const after = await M(() => { const w = global.__alos.mv.active; const so = w.society; return { sick: Object.values(so.persons).filter((p) => p.alive !== false && !p.dead && p.sick).length, log: w.timeline.slice(-60).filter((e) => e.kind === 'human' || /瘟疫|疫/.test(e.text)).map((e) => e.text).slice(-4).join(' | ') }; });
    expect(/瘟疫/.test(after.log), '时间线里没有瘟疫'); const s = await W(); expect(s.violations === 0, `定律违反 ${s.violations}`);
    return `患病 ${before} → ${after.sick}；时间线：${after.log.slice(0, 120)}`;
  });

  // ---------------- 平行世界：分叉 → 运行 → 对比 ----------------
  await step('分叉平行世界', '平行世界页填写分支名并点「分叉平行世界」，出现第二个世界并独立运行', async () => {
    await nav('平行世界'); await sleep(500);
    await page.locator('input[placeholder="例如：更节俭的自己"]').fill('E2E 节俭分支');
    await btn('分叉平行世界').click(); const s = await until((x) => x.worlds.length === 2, 15000);
    await sleep(3000); const s2 = await W(); const b = s2.worlds.find((w) => w.name === 'E2E 节俭分支'); expect(b && b.steps > s.worlds[1].steps, '分支没有运行');
    await auditView('平行世界'); return `世界 ${s2.worlds.map((w) => `${w.name}@${w.steps}`).join('、')}`;
  });
  await step('并排对比', '点「并排对比这些世界」，看到两个世界的对比视图', async () => {
    await btn('并排对比这些世界').click(); await sleep(1500); const txt = await page.locator('.main, main').first().innerText();
    expect(txt.includes('E2E 节俭分支') && txt.includes('主世界'), '对比视图缺少世界'); await auditView('并排对比'); return '对比视图同时显示主世界与 E2E 节俭分支';
  });

  // ---------------- 镜像世界 ----------------
  await step('镜像世界：地球', '侧栏点「镜像世界」，3D 地球渲染（canvas）', async () => {
    await nav('镜像世界'); await page.waitForSelector('.mirror-stage canvas', { timeout: 20000 }); await sleep(2500); await auditView('镜像世界'); return 'canvas 已渲染';
  });
  await step('镜像世界：街区', '点「街区」切换到街区视图', async () => {
    await page.locator('.mirror-top button', { hasText: '街区' }).click(); await sleep(3000); const c = await page.locator('.mirror-top .crumbs').innerText(); expect(c.includes('街区'), '面包屑未进入街区'); return `面包屑：${c.replace(/\s+/g, ' ')}`;
  });
  await step('镜像世界：点击居民', '在「居民动态」列表点主角，右侧出现居民卡片', async () => {
    await page.locator('.res-list li').first().click(); await sleep(1500); const t = await page.locator('.mirror-side').innerText(); expect(t.includes('居民'), '没有居民卡片'); return t.split('\n').slice(0, 4).join(' / ');
  });
  await step('镜像世界：点击地点', '在 3D 街区里点击建筑，右侧出现地点卡片', async () => {
    await page.locator('.mirror-side button[aria-label="关闭"]').first().click().catch(() => {}); await sleep(600);
    const box = await page.locator('.mirror-stage canvas').first().boundingBox(); let hit = '';
    for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.4, 0.6], [0.6, 0.6], [0.5, 0.62], [0.35, 0.5], [0.65, 0.5]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await sleep(700);
      const t = await page.locator('.mirror-side').innerText(); if (/坐标/.test(t) && /地点/.test(t)) { hit = t.split('\n').slice(0, 3).join(' / '); break; }
    }
    expect(hit, '点击 3D 场景 8 处都没有选中地点'); return hit;
  });
  await step('生命与家族', '侧栏点「生命与家族」，看到主角基因、家谱与人口', async () => {
    await nav('生命与家族'); await sleep(1200); await auditView('生命与家族'); const t = await page.locator('.main, main').first().innerText(); expect(t.length > 50, '页面空白'); return t.split('\n').slice(0, 3).join(' / ');
  });
  await step('文明与环境', '侧栏点「文明与环境」，文明/环境/维度三个页签都能打开', async () => {
    await nav('文明与环境'); for (const tab of ['文明', '环境与生态', '维度体系']) { await page.locator('.main .seg button').filter({ hasText: new RegExp(`^${tab}$`) }).filter({ visible: true }).first().click({ timeout: 8000 }); await sleep(500); await auditView(`文明-${tab}`); } return '三个页签均渲染';
  });
  await step('其余页面巡检', '活动、记忆、身份、任务板世界、适配器与设置均可打开且无报错', async () => {
    const seen = []; for (const v of ['活动', '记忆', '身份', '任务板世界', '适配器与设置']) { await nav(v); await sleep(500); await auditView(v); seen.push(v); if (v === '活动') { expect(await page.locator('.main').getByText('运行可观测性').count() > 0, '活动页没有可观测性面板'); await shot('活动-运行可观测性'); } if (v === '记忆') { expect(await page.locator('.main').getByText('记忆检索').count() > 0, '记忆页没有检索面板'); await shot('记忆-记忆流'); } }
    const s = await W(); expect(s.mind.plan > 0, '没有生成今日计划'); expect(s.mind.reflections > 0 && s.mind.insights > 0, '没有发生反思'); expect(s.rel.verified > 0, '没有可靠性统计'); expect(s.trace && s.trace.n > 0 && s.trace.violations === 0, '没有运行轨迹或有违反'); return `${seen.join('、')}；可靠性：校验通过 ${s.rel.verifyRate}%、目标完成 ${s.rel.goalRate}%、卡死自救 ${s.rel.stuck}、预算熔断 ${s.rel.budget}；可观测性：最近 ${s.trace.n} 步 P50 ${s.trace.p50} ms / P95 ${s.trace.p95} ms，定律检查 ${s.trace.lawChecks} 次；记忆流：今日计划 ${s.mind.plan} 项、反思 ${s.mind.reflections} 次、洞见 ${s.mind.insights} 条`;
  });

  // ---------------- 重启续存 ----------------
  await recStop();
  const pre = await W(); const preSteps = Object.fromEntries(pre.worlds.map((w) => [w.id, w.steps]));
  await close();
  await launch({}, 'run2');
  await step('重启应用：世界与状态续存', '关闭再打开应用：不再出现引导，两个世界、主角、账本、改过的法则都还在，并从上次的步数继续', async () => {
    await page.waitForSelector('.sidebar', { timeout: 30000 }); await sleep(1500);
    expect(!(await page.locator('.modal[role=dialog]').count()), '重启后又出现了新手引导');
    const s = await W(); expect(s.worlds.length === pre.worlds.length, `世界数 ${pre.worlds.length} → ${s.worlds.length}`);
    expect(s.name === pre.name, `主角变了 ${pre.name} → ${s.name}`);
    for (const w of s.worlds) expect(w.steps >= preSteps[w.id], `${w.name} 步数倒退 ${preSteps[w.id]} → ${w.steps}`);
    expect(pre.ledger.every((t) => s.ledger.some((q) => q.id === t.id)), '账本记录丢失'); expect(Math.abs(s.config.maxLifespan - pre.config.maxLifespan) < 1e-6, '法则没有续存');
    return `世界 ${s.worlds.map((w) => `${w.name} ${preSteps[w.id]}→${w.steps} 步`).join('、')}；主角 ${s.name}；账本 ${s.ledger.length} 条；寿命上限 ${s.config.maxLifespan.toFixed(1)}`;
  });

  // ---------------- 孵化新智能体 ----------------
  await step('孵化新智能体', 'God Mode 下点侧栏「孵化新智能体」，输入种子并「创世并孵化」，新主角出现、平行世界被重置', async () => {
    if ((await page.locator('.lockbtn').getAttribute('aria-pressed')) !== 'true') await page.locator('.lockbtn').click();
    await btn('孵化新智能体').click(); await page.waitForSelector('#na-title'); await page.locator('.modal input.mono').fill('e2e-newborn-2026');
    await btn('创世并孵化').click(); await page.waitForSelector('#na-title', { state: 'detached', timeout: 20000 });
    const s = await until((x) => x.name !== pre.name, 20000); expect(s.worlds.length === 1, `世界数 ${s.worlds.length}`); await sleep(1000);
    return `新主角 ${s.name}，世界 ${s.worlds.length} 个，当前页「${await page.locator('.sidebar button.on').first().getAttribute('title')}」`;
  });
  const born = await W();

  // ---------------- 长跑健康（约 10 分钟） ----------------
  await step(`长跑 ${SOAK_LABEL}`, '世界持续运行，每 30 秒切换页面并采样内存/CPU，无崩溃、无定律违反、内存不持续增长', async () => {
    await nav('概览'); const views = ['概览', '智能体桌面', '镜像世界', '活动', '平行世界', '生命与家族', '文明与环境', '收支与审批'];
    const s0 = await sample('soak-start'); const tEnd = Date.now() + SOAK_MS; let i = 0, approvedN = 0;
    while (Date.now() < tEnd) {
      await sleep(Math.min(30000, Math.max(0, tEnd - Date.now()))); await nav(views[i++ % views.length]);
      const s = await W(); approvedN = Math.max(approvedN, s.approvals.length); // 长跑期间不批准：模拟守护者离开，订单保持待审批（不扣款）
      await sample(`soak-${i}`);
    }
    const s1 = await sample('soak-end'); const w = await W(); expect(w.violations === 0, `定律违反 ${w.violations}`); expect(!health.crashes.length, '渲染进程崩溃');
    const cpus = health.samples.filter((x) => x.cpuPct != null).map((x) => x.cpuPct); const rss = health.samples.filter((x) => /soak/.test(x.tag)).map((x) => x.rssMB);
    health.soak = { cpuAvg: cpus.length ? Math.round(cpus.reduce((a, b) => a + b, 0) / cpus.length) : null, cpuMax: cpus.length ? Math.max(...cpus) : null, rssMin: Math.min(...rss), rssMax: Math.max(...rss) };
    return `CPU 平均 ${health.soak.cpuAvg}%（峰值 ${health.soak.cpuMax}%，100% = 一个核），步数 ${born.steps} → ${w.steps}，内存 ${s0.rssMB} → ${s1.rssMB} MB（主进程堆 ${s0.mainHeapMB} → ${s1.mainHeapMB} MB，渲染堆 ${s0.rendererHeapMB} → ${s1.rendererHeapMB} MB），期间最多 ${approvedN} 笔待审批（守护者离开，未批准、未扣款），违反定律 0`;
  });
  await close();

  // ---------------- 第三段：真实 VNC ----------------
  const VD = '57', VPORT = 5957, VPASS = 'alos123'; const llm = await mockLLM();
  execSync(`bash ${root}/scripts/vnc-demo.sh stop ${VD}; bash ${root}/scripts/vnc-demo.sh ${VD} ${VPORT} ${VPASS}`, { stdio: 'ignore' });
  await launch({ OPENAI_BASE_URL: llm.url, OPENAI_MODEL: 'mock-vision', OPENAI_API_KEY: '' }, 'run3');
  await step('再次重启：新智能体续存', '重启后仍是刚孵化的新主角', async () => { const s = await W(); expect(s.name === born.name, `${born.name} → ${s.name}`); return `主角 ${s.name}，步数 ${born.steps} → ${s.steps}`; });
  await step('VNC：添加并测试连接', '智能体桌面点「添加 VNC 电脑」，填写 127.0.0.1:5957 与密码，「测试连接」显示连接成功与首帧预览', async () => {
    await nav('智能体桌面'); await btn('添加 VNC 电脑').click(); await page.waitForSelector('#dk-add-t');
    const m = page.locator('.dk-modal'); await m.locator('input').nth(0).fill('E2E · Xvfb 演示机'); await m.locator('input').nth(2).fill(String(VPORT)); await m.locator('input[type=password]').fill(VPASS);
    await btn('测试连接', m).click(); await m.locator('.dk-test').waitFor({ timeout: 15000 }); const t = await m.locator('.dk-test').innerText();
    expect(t.includes('连接成功'), t); return t.replace(/\s+/g, ' ');
  });
  await step('VNC：保存并绑定', '「保存目标」后点该目标绑定，屏幕显示 VNC 实时画面；沙盒上未批准的旧订单随换电脑作废', async () => {
    await btn('保存目标', page.locator('.dk-modal')).click(); await sleep(800);
    await page.locator('.dk-target-main', { hasText: 'E2E · Xvfb 演示机' }).click();
    const s = await until((x) => x.bound === 'vnc', 15000); await page.waitForSelector('.dk-screen img', { timeout: 15000 }).catch(() => {}); await sleep(1500);
    const hasImg = await page.locator('.dk-screen img').count(); expect(hasImg, '没有显示 VNC 画面');
    const stale = s.approvals.filter((a) => a.memo !== 'VNC 演示订单'); expect(!stale.length, `换电脑后旧审批仍在：${JSON.stringify(stale)}`);
    const voided = await M(() => global.__alos.mv.active.timeline.filter((e) => /作废待审批/.test(e.text)).map((e) => e.text));
    return `已绑定 VNC，画面元素 ${hasImg}；作废旧审批 ${voided.length} 笔${voided[0] ? `（${voided[0]}）` : ''}`;
  });
  await step('VNC：智能体自己操作（视觉模型）', '模拟视觉模型收到真实截图后坐标点击，屏幕变化校验通过，并对购买发起审批', async () => {
    const s = await until((x) => x.approvals.some((a) => a.memo === 'VNC 演示订单'), 60000);
    const acts = await M(() => global.__alos.mv.active.desktop.actions.filter((a) => !a.human).map((a) => ({ t: a.action?.type, v: a.verify?.ok, src: a.source })));
    const click = acts.find((a) => a.t === 'click'); expect(click, '没有点击动作'); expect(click.v, '点击后屏幕没有变化');
    return `动作 ${acts.map((a) => a.t).join('→')}，点击校验通过，审批「VNC 演示订单」$1.5 出现`;
  });
  await step('VNC：拒绝演示订单', '点「拒绝」，VNC 上的购买不扣款', async () => {
    const b = (await W()).balance; const before = (await W()).approvals; expect(before.length === 1, `待审批应只有 VNC 这一笔（换电脑时旧订单应作废）：${JSON.stringify(before)}`); await page.locator('.approvals .approval', { hasText: 'VNC 演示订单' }).first().locator('button', { hasText: '拒绝' }).click(); await sleep(800); const s = await W(); expect(!s.approvals.some((a) => before.some((q) => q.id === a.id)), `审批未消失 前 ${JSON.stringify(before)} 后 ${JSON.stringify(s.approvals)}`); expect(Math.abs(s.balance - b) < 0.01, '扣款了'); return `余额 $${b} → $${s.balance}`;
  });
  await step('VNC：接管并手动点击', '开启 God Mode、点「接管」，在画面上点击，操作送达 VNC 并写入审计；再「交还控制」', async () => {
    if ((await page.locator('.lockbtn').getAttribute('aria-pressed')) !== 'true') await page.locator('.lockbtn').click();
    await btn('接管').click(); await until((x) => x.takeover, 5000); await M(async () => { const w = global.__alos.mv.active; for (let i = 0; i < 40 && w.busy; i++) await new Promise((r) => setTimeout(r, 100)); }); const img = page.locator('.dk-screen img').first(); const bb = await img.boundingBox();
    await page.mouse.click(bb.x + bb.width * 0.42, bb.y + bb.height * 0.235); await sleep(1200);
    const s = await W(); expect(s.lastAction?.human && s.lastAction.type === 'click', `最后动作 ${JSON.stringify(s.lastAction)}`);
    await btn('交还控制').click(); await until((x) => !x.takeover, 5000); return `人工点击已送达（${s.lastAction.type}，ok=${s.lastAction.ok}），已交还`;
  });
  await step('解除 VNC，回到沙盒', '「解除绑定」后可重新绑定内置沙盒', async () => {
    await btn('解除绑定').click(); await sleep(800); await page.locator('.dk-target-main', { hasText: '内置沙盒' }).click(); const s = await until((x) => x.bound === 'sandbox', 10000); return `已回到 ${s.bound}`;
  });
  const fin = await W(); health.finalViolations = fin.violations;
  await close(); llm.srv.close(); execSync(`bash ${root}/scripts/vnc-demo.sh stop ${VD}`, { stdio: 'ignore' });

  // ---------------- 录像 → GIF ----------------
  try {
    const mp4 = path.join(VIDEO, 'journey.mp4');
    if (fs.existsSync(mp4)) {
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'setpts=0.25*PTS,fps=5,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer', path.join(OUT, 'journey.gif')]);
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'setpts=0.25*PTS,scale=1280:-2', '-an', '-c:v', 'libx264', '-crf', '30', path.join(OUT, 'journey.mp4')]);
    }
  } catch (e) { log('录像转换失败', e.message); }

  // ---------------- 汇总 ----------------
  const noEmoji = spawnSync(process.execPath, [path.join(__dirname, 'no-emoji.test.js')], { encoding: 'utf8' });
  health.noEmoji = noEmoji.status === 0; health.totalMs = Date.now() - t0;
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, health }, null, 1));
  log(`\n步骤 ${passed}/${results.length} 通过；残留退出层 ${(health.stuckExits || []).length}；控制台错误 ${health.console.length}；页面异常 ${health.pageErrors.length}；崩溃 ${health.crashes.length}；死按钮 ${health.deadButtons.length}；文案疑点 ${health.copy.length}；定律违反 ${health.finalViolations}；无 emoji ${health.noEmoji}`);
  for (const k of ['console', 'pageErrors', 'mainStderr', 'crashes']) for (const x of health[k].slice(0, 10)) log(`  ${k}: ${x}`);
  for (const d of health.deadButtons) log('  dead:', JSON.stringify(d)); for (const d of health.copy) log('  copy:', JSON.stringify(d));
  const green = passed === results.length && !(health.stuckExits || []).length && !health.pageErrors.length && !health.crashes.length && !health.console.length && health.finalViolations === 0 && health.noEmoji;
  log(green ? 'E2E_GREEN' : 'E2E_RED'); xvfb?.kill(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(green ? 0 : 1);
})().catch(async (e) => { console.error('E2E 中断：', e); try { await app?.close(); } catch {} xvfb?.kill(); process.exit(2); });
