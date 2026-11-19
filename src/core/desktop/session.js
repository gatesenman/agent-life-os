'use strict';
// 第一人称“智能体桌面”会话：把一台人类指定的本地电脑（内置沙盒或 VNC）绑定给某个智能体，
// 并运行 computer-use 循环：截图/屏幕解析 → 决策（视觉 LLM 或规则回退）→ 键鼠动作 → 校验。
// 目标来自生命需求（饥饿 → 点外卖，钱少 → 找零工，疲惫 → 休息），支付一律走引擎的预算策略与人工审批。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { SandboxOS } = require('./sandboxOS');
const { RFBClient } = require('./rfb');
const { chatJSON, llmEnabled, llmConfig } = require('../llm');

const ACTION_TYPES = ['move', 'click', 'double_click', 'type', 'key', 'scroll', 'wait', 'rest', 'request_payment', 'done'];
const PLANS = {
  eat: [['open', '打开浏览器'], ['site', '进入速达外卖'], ['shop', '挑一家餐厅'], ['dish', '选菜加入购物车'], ['checkout', '去结算'], ['submit', '提交订单（发起支付请求）'], ['approve', '等待守护者批准'], ['deliver', '等待骑手送达'], ['eat', '确认收货，吃饭']],
  work: [['open', '打开浏览器'], ['site', '进入灵活工作'], ['pick', '挑一个适合自己的零工'], ['write', '撰写交付内容'], ['submit', '提交成果'], ['paid', '等待验收与付款']],
  diary: [['open', '打开记事本'], ['write', '写下今天的日记'], ['save', '保存']],
  rest: [['rest', '离开电脑，休息一小时']],
  vnc: [['observe', '观察屏幕'], ['act', '按目标操作'], ['verify', '确认结果']],
};
const GOAL_TITLE = { eat: '点一份外卖', work: '找零工赚钱', diary: '写日记', rest: '休息一下' };
const short = (s, n = 60) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
const center = (e) => ({ x: Math.round(e.x + e.w / 2), y: Math.round(e.y + e.h / 2) });
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

// ---------------- 驱动：内置沙盒 ----------------
class SandboxDriver {
  constructor(os) { this.kind = 'sandbox'; this.os = os; this.status = { state: 'connected', label: '内置沙盒桌面（离线）', width: 1280, height: 800 }; }
  async connect() { return this.status; }
  async observe() { const p = this.os.parse(); return { kind: 'sandbox', width: 1280, height: 800, parse: p, sig: hash(JSON.stringify(p)), text: describeParse(p) }; }
  async act(a) { return this.os.act(a); }
  view() { return this.os.screen(); }
  frameForRecording() { return { nodes: this.os.layout(), cursor: this.os.cursor }; }
  close() {}
}
function describeParse(p) {
  return `屏幕 ${p.width}x${p.height}，最前窗口「${p.topWindow}」${p.address != null ? `，当前页面 ${p.page}，地址栏文字：${p.address || '（空）'}` : ''}\n可见元素（role · 文本 · 矩形 x,y,w,h）：\n` +
    p.elements.map((e) => `- ${e.role}${e.focused ? '[焦点]' : ''} · ${short(e.label || e.value || '', 70)}${e.value ? ` · 值「${short(e.value, 40)}」` : ''} · ${e.x},${e.y},${e.w},${e.h}`).join('\n');
}

// ---------------- 驱动：VNC（QEMU / VirtualBox / UTM / 任意 VNC 服务器） ----------------
class VncDriver extends EventEmitter {
  constructor(target) { super(); this.kind = 'vnc'; this.target = target; this.status = { state: 'idle', label: `${target.name}（${target.host}:${target.port}）` }; this.cursor = { x: 0, y: 0 }; }
  async connect() {
    if (this.c && !this.c.closed) return this.status;
    this.status = { ...this.status, state: 'connecting' };
    // 部分 VNC 服务器（如 x11vnc）在上一条连接刚断开时会重置新连接（ECONNRESET）：短暂重试两次；认证失败不重试
    let last;
    for (let i = 0; i < 3; i++) {
      this.c = new RFBClient({ host: this.target.host, port: this.target.port, password: this.target.password, timeoutMs: 5000 });
      try {
        const info = await this.c.connect(); await this.c.waitFrame(2000);
        this.status = { ...this.status, state: 'connected', ...info, error: null };
        this.c.on('frame', () => this.emit('frame'));
        this.c.on('close', () => { this.status = { ...this.status, state: 'disconnected' }; this.emit('status'); });
        return this.status;
      } catch (e) { last = e; try { this.c.close(); } catch {} this.c = null; if (/认证|密码/.test(e.message)) break; await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
    }
    this.status = { ...this.status, state: 'error', error: last.message }; throw last;
  }
  async observe() {
    await this.connect(); await this.c.waitFrame(600);
    const { png, width, height } = this.c.screenshot({ maxWidth: Number(process.env.ALOS_CUA_SHOT_WIDTH || 1280) });
    const image = 'data:image/png;base64,' + png.toString('base64');
    return { kind: 'vnc', width: this.c.width, height: this.c.height, shotWidth: width, shotHeight: height, image, sig: hash(this.c.fb.subarray(0, Math.min(this.c.fb.length, 2e6)).toString('base64')), text: `VNC 屏幕 ${this.c.width}x${this.c.height}（截图已附上，坐标以原始分辨率为准）。` };
  }
  async act(a) {
    await this.connect(); const c = this.c;
    if (a.type === 'move') { c.pointer(a.x, a.y, 0); this.cursor = { x: a.x, y: a.y }; return { ok: true, message: `鼠标移动到 (${a.x}, ${a.y})`, minutes: 0.2 }; }
    if (a.type === 'click' || a.type === 'double_click') { await c.click(a.x, a.y, a.button === 'right' ? 3 : 1, a.type === 'double_click'); this.cursor = { x: a.x, y: a.y }; return { ok: true, message: `点击 (${a.x}, ${a.y})`, minutes: 0.5 }; }
    if (a.type === 'type') { await c.type(a.text || ''); return { ok: true, message: `输入了 ${[...String(a.text || '')].length} 个字符`, minutes: Math.max(0.5, [...String(a.text || '')].length / 40) }; }
    if (a.type === 'key') { await c.combo(a.keys || ''); return { ok: true, message: `按键 ${a.keys}`, minutes: 0.2 }; }
    if (a.type === 'scroll') { await c.scroll(a.x ?? this.cursor.x, a.y ?? this.cursor.y, a.dy || 300); return { ok: true, message: `滚动 ${a.dy || 300}`, minutes: 0.3 }; }
    if (a.type === 'wait') { await new Promise((r) => setTimeout(r, 400)); return { ok: true, message: a.reason || '等待', minutes: a.minutes || 2 }; }
    return { ok: false, message: `不支持的动作 ${a.type}`, minutes: 0.2 };
  }
  view() { return { kind: 'vnc', width: this.c?.width || 1280, height: this.c?.height || 800, cursor: this.cursor, status: this.status }; }
  frame(maxWidth = 1280) { if (!this.c || this.c.closed) return null; const { png } = this.c.screenshot({ maxWidth }); return 'data:image/png;base64,' + png.toString('base64'); }
  frameForRecording() { return { image: this.frame(640), cursor: this.cursor }; }
  close() { this.c?.close(); this.c = null; this.status = { ...this.status, state: 'idle' }; }
}

// ---------------- 会话 ----------------
class DesktopSession extends EventEmitter {
  constructor({ seed, branchSeed = '', skills = [], recordDir = null, state = null } = {}) {
    super();
    this.seed = seed; this.branchSeed = branchSeed; this.skills = skills; this.recordDir = recordDir;
    this.os = state?.os ? SandboxOS.restore(state.os, { branchSeed }) : new SandboxOS({ seed, branchSeed, skills });
    this.target = null; this.driver = null; this.goal = state?.goal || null; this.rel = state?.rel || { acts: 0, verified: 0, verifyOk: 0, stuck: 0, budget: 0, done: 0, failed: 0 }; this.trail = []; this.mem = state?.mem || { lastShop: null, gigsDone: 0, diaryAt: -1, orders: 0 };
    this.thoughts = []; this.actions = []; this.recordings = []; this.rec = null; this.aseq = 0; this.lastAction = null;
  }
  get active() { return !!this.driver; }
  async bind(target) {
    if (this.goal && this.target && this.target.id !== target.id) this.finishGoal('failed', `换到了「${target.name}」，放弃当前目标`);
    this.unbind();
    this.target = target;
    if (target.kind === 'sandbox') this.driver = new SandboxDriver(this.os);
    else { this.driver = new VncDriver(target); this.driver.on('frame', () => this.emit('frame')); this.driver.on('status', () => this.emit('status')); try { await this.driver.connect(); } catch { /* 状态里有错误，界面显示 */ } }
    return this.driver.status;
  }
  unbind() { this.driver?.close(); this.driver = null; this.target = null; }
  // ---------- 目标：由生命需求产生 ----------
  chooseGoal(ctx) {
    const { hunger, energy, wallet, policy } = ctx; const bal = wallet.balance; const left = policy.dailyCapUsd - policy.spentToday;
    if (this.driver.kind === 'vnc') {
      const need = hunger >= 0.6 ? ['eat', `饥饿 ${Math.round(hunger * 100)}% ≥ 60%`] : bal < 12 ? ['work', `余额 $${bal.toFixed(2)} < $12`] : ['work', '没有紧急需求，保持生产'];
      return { kind: need[0], title: process.env.ALOS_CUA_GOAL || (need[0] === 'eat' ? '在这台电脑上点一份外卖（付款前必须申请审批）' : '在这台电脑上找一份合规的零工'), why: need[1] };
    }
    const order = this.os.activeOrder();
    if (order) return { kind: 'eat', title: GOAL_TITLE.eat, why: `订单 ${order.id} 进行中` };
    if (energy < 22) return { kind: 'rest', title: GOAL_TITLE.rest, why: `能量 ${Math.round(energy)} < 22` };
    // 守护者刚拒绝过外卖：90 分钟内（世界时间）不再追问，除非饿到 90% 以上
    const cool = this.mem.rejectAt != null && ctx.absMinutes != null ? 90 - (ctx.absMinutes - this.mem.rejectAt) : 0;
    if (hunger >= 0.6 && cool > 0 && hunger < 0.9) return { kind: 'work', title: '先忍一忍，去赚点钱', why: `守护者刚拒绝了外卖，${Math.ceil(cool)} 分钟内不再请求（饥饿 ${Math.round(hunger * 100)}%）` };
    if (hunger >= 0.6) {
      if (bal >= 4.5 && left >= 4.5) return { kind: 'eat', title: GOAL_TITLE.eat, why: `饥饿 ${Math.round(hunger * 100)}% ≥ 60%（生理需求）` };
      return { kind: 'work', title: '先赚钱再吃饭', why: `饥饿 ${Math.round(hunger * 100)}%，但${bal < 4.5 ? `余额只有 $${bal.toFixed(2)}` : `今日预算只剩 $${left.toFixed(2)}`}` };
    }
    if (bal < 12) return { kind: 'work', title: GOAL_TITLE.work, why: `余额 $${bal.toFixed(2)} < $12（安全需求）` };
    if (ctx.step - this.mem.diaryAt > 40) return { kind: 'diary', title: GOAL_TITLE.diary, why: '记录生活（自我实现需求）' };
    return { kind: 'work', title: GOAL_TITLE.work, why: '没有紧急需求，保持生产' };
  }
  startGoal(g, ctx) {
    const kind = this.driver.kind === 'vnc' ? 'vnc' : g.kind;
    this.goal = { id: 'G' + (++this.aseq) + '-' + Date.now().toString(36), ...g, plan: PLANS[kind].map(([id, title]) => ({ id, title, status: 'pending' })), status: 'active', started: ctx.clock, steps: 0, fails: 0, pick: null };
    this.rec = { id: this.goal.id, goal: g.title, why: g.why, kind: g.kind, target: this.target.name, started: ctx.clock, startedAt: Date.now(), steps: [] };
    this.say(`新目标：${g.title}（因为${g.why}）`, 'goal');
  }
  say(text, kind = 'thought') { this.thoughts.push({ id: ++this.aseq, text, kind }); if (this.thoughts.length > 40) this.thoughts.shift(); }
  setStep(id) { if (!this.goal) return; let seen = false; for (const s of this.goal.plan) { if (s.id === id) { s.status = 'active'; seen = true; } else s.status = seen ? 'pending' : 'done'; } }
  finishGoal(status, note) {
    const g = this.goal; if (!g) return; g.status = status; this.trail = []; if (status === 'done') this.rel.done++; else this.rel.failed++; if (status === 'done') g.plan.forEach((s) => { s.status = 'done'; });
    this.say(`${status === 'done' ? '完成' : '放弃'}目标「${g.title}」${note ? '：' + note : ''}`, status === 'done' ? 'done' : 'fail');
    if (this.rec) { this.rec.ended = g.lastClock; this.rec.status = status; this.rec.note = note; this.recordings.push(this.rec); if (this.recordings.length > 12) this.recordings.shift(); this.saveRec(this.rec); this.rec = null; }
    this.goal = null;
  }
  saveRec(r) { if (!this.recordDir) return; try { fs.mkdirSync(this.recordDir, { recursive: true }); fs.writeFileSync(path.join(this.recordDir, r.id + '.json'), JSON.stringify(r)); } catch {} }
  listRecordings() {
    const mem = this.recordings.map((r) => ({ id: r.id, goal: r.goal, why: r.why, status: r.status, started: r.started, ended: r.ended, steps: r.steps.length, target: r.target }));
    return mem.reverse();
  }
  getRecording(id) { const r = this.recordings.find((x) => x.id === id) || (this.rec?.id === id ? this.rec : null); if (r) return r; try { return JSON.parse(fs.readFileSync(path.join(this.recordDir, id + '.json'), 'utf8')); } catch { return null; } }

  // ---------- 一次 computer-use 步骤 ----------
  async tick(ctx) {
    if (this.driver.kind === 'sandbox') this.os.tick(ctx.absMinutes, ctx.clock);
    let obs;
    try { obs = await this.driver.observe(); } catch (e) { return this.outcome(ctx, { thought: `连接不到这台电脑：${e.message}`, action: { type: 'wait', minutes: 5, reason: '等待电脑恢复连接' } }, null, { ok: false, message: e.message, minutes: 5 }); }
    if (this.rejectPending) { this.mem.rejectAt = ctx.absMinutes; this.rejectPending = false; if (this.goal?.kind === 'eat' && this.driver.kind === 'sandbox') this.finishGoal('failed', '守护者拒绝了这笔外卖，先去做别的事'); }
    if (!this.goal) this.startGoal(this.chooseGoal(ctx), ctx);
    this.goal.lastClock = ctx.clock; this.goal.steps++;
    let d;
    if (llmEnabled() && process.env.ALOS_CUA_RULES !== '1') {
      try { d = await this.llmDecide(obs, ctx); d.source = 'llm'; } catch (e) { if (obs.kind !== 'sandbox') d = { thought: `视觉模型出错：${short(e.message, 80)}，先等待。`, action: { type: 'wait', minutes: 2 }, source: 'llm-error' }; else { d = this.ruleDecide(obs, ctx); d.thought = `（LLM 出错，改用规则：${short(e.message, 50)}）` + d.thought; } }
    } else if (obs.kind === 'sandbox') d = this.ruleDecide(obs, ctx);
    else d = { thought: '这是一台真实的 VNC 电脑，但没有配置视觉 LLM（OPENAI_BASE_URL / OPENAI_MODEL），我看不懂截图。只能等待；守护者可以接管操作。', action: { type: 'wait', minutes: 5, reason: '等待配置视觉模型' }, source: 'none', idle: true };
    if (!d.action || !ACTION_TYPES.includes(d.action.type)) d = { ...d, thought: (d.thought || '') + `（无效动作 ${d.action?.type}，改为等待）`, action: { type: 'wait', minutes: 1 } };
    if (d.step) this.setStep(d.step);
    // L18：模型思考期间守护者接管了电脑 → 这一步作废，不执行任何动作
    if (this.held?.()) return { thought: '守护者接管了这台电脑，我停下手，等交还控制。', action: { type: 'wait', minutes: 0.2, reason: '守护者接管中' }, source: 'held', result: { ok: true, message: '守护者接管中，未执行动作', minutes: 0.2 }, verify: null, held: true };
    if (d.finish) { const res = { ok: true, message: d.finish.note || '目标完成', minutes: 0.2 }; const out = this.outcome(ctx, d, obs, res); this.finishGoal(d.finish.status || 'done', d.finish.note); return out; }
    // 执行
    let res;
    if (d.action.type === 'rest') { this.os.away = '离开电脑休息中'; res = { ok: true, message: '离开电脑，休息了一小时', minutes: 60, resting: true }; }
    else if (d.action.type === 'request_payment') { const a = d.action; res = { ok: true, message: `请求支付 $${a.amount}（${a.merchant}）：${a.memo}`, minutes: 0.5, payment: { amount: Number(a.amount), merchant: String(a.merchant || 'VNC 商户'), memo: String(a.memo || '电脑内购买'), desktop: { kind: 'vnc', id: 'V' + this.aseq } } }; }
    else if (d.action.type === 'done') { res = { ok: true, message: '模型报告目标完成', minutes: 0.2 }; }
    else { if (this.os.away && this.driver.kind === 'sandbox') this.os.away = null; try { res = await this.driver.act(d.action); } catch (e) { res = { ok: false, message: '动作失败：' + e.message, minutes: 0.5 }; } }
    // 校验
    let verify = null;
    if (d.expect && this.driver.kind === 'sandbox') { const p2 = this.os.parse(); const ok = !!d.expect.fn(p2, res); verify = { ok, text: ok ? d.expect.ok : d.expect.fail || `未达到预期：${d.expect.ok}` }; }
    else if (!['wait', 'rest', 'request_payment', 'done', 'move'].includes(d.action.type)) { try { let o2 = await this.driver.observe(); for (let k = 0; k < 4 && o2.sig === obs.sig && this.driver.kind === 'vnc'; k++) { await new Promise((r) => setTimeout(r, 250)); o2 = await this.driver.observe(); } verify = { ok: o2.sig !== obs.sig, text: o2.sig !== obs.sig ? '屏幕有变化' : '屏幕没有变化' }; } catch { verify = { ok: false, text: '无法重新截图' }; } }
    // v0.5 可靠性：行动觉察（Project Sid）+ 卡死检测（OpenHands StuckDetector）+ 步数预算（browser-use）
    if (!['wait', 'rest'].includes(d.action.type)) this.rel.acts++;
    if (verify) { this.rel.verified++; if (verify.ok) this.rel.verifyOk++; }
    if (this.goal) {
      const sig = JSON.stringify(d.action) + '|' + (obs?.sig ?? '') + '|' + (verify?.ok ?? '');
      this.trail.push(sig); if (this.trail.length > 6) this.trail.shift();
      const rep = this.trail.slice(-3); const looping = verify && !verify.ok && rep.length === 3 && rep.every((x) => x === rep[0]);
      if (looping) { this.rel.stuck++; this.trail = []; const out = this.outcome(ctx, d, obs, res, verify); this.finishGoal('failed', '行动觉察：同一动作在同一画面上连续 3 次无效，判定卡死，换个目标重来'); return out; }
      if (!d.idle && d.action.type !== 'wait') this.goal.work = (this.goal.work || 0) + 1;
      if ((this.goal.work || 0) > 120) { this.rel.budget++; const out = this.outcome(ctx, d, obs, res, verify); this.finishGoal('failed', '超出单个目标的步数预算（120 步）'); return out; }
    }
    if (verify && !verify.ok) { this.goal.fails++; if (this.goal.fails >= 6) { const out = this.outcome(ctx, d, obs, res, verify); this.finishGoal('failed', '连续多次未达到预期'); return out; } }
    const out = this.outcome(ctx, d, obs, res, verify);
    if (d.action.type === 'done' && this.goal) this.finishGoal('done', d.thought);
    if (d.then === 'finish' && this.goal) this.finishGoal('done', d.thenNote);
    return out;
  }
  outcome(ctx, d, obs, res, verify) {
    const a = { id: ++this.aseq, clock: ctx.clock, action: d.action, thought: d.thought, result: res.message, ok: res.ok, verify, source: d.source, step: this.goal?.plan.find((s) => s.status === 'active')?.title };
    this.lastAction = a; this.actions.push(a); if (this.actions.length > 60) this.actions.shift();
    if (d.thought) this.say(d.thought, d.source === 'llm' ? 'llm' : 'thought');
    if (this.rec) { this.rec.steps.push({ ...a, frame: this.driver.frameForRecording() }); if (this.rec.steps.length > 120) this.rec.steps.shift(); }
    return { thought: d.thought, source: d.source, action: d.action, result: { minutes: 0.5, ...res }, verify, idle: d.idle };
  }

  // ---------- 规则回退（仅内置沙盒）：纯屏幕解析 + 坐标点击 ----------
  ruleDecide(obs, ctx) {
    const p = obs.parse; const els = p.elements; const g = this.goal;
    const txt = els.filter((e) => e.role === 'text').map((e) => e.label).join('\n');
    const btn = (re) => els.find((e) => e.role === 'button' && re.test(e.label) && e.enabled !== false);
    const box = (role) => els.find((e) => e.role === role);
    const click = (e, thought, step, expect) => ({ thought, step, action: { type: 'click', ...center(e) }, expect });
    const ex = (ok, fn, fail) => ({ ok, fn, fail });
    const addr = p.page; // 当前已加载的页面（读取标签页/页面内容得知），地址栏文字另见 p.address
    const openBrowser = (step = 'open') => { const b = els.find((e) => e.role === 'button' && /^浏览器/.test(e.label) && e.y > 700) || btn(/^浏览器/); return click(b, '先打开浏览器。', step, ex('浏览器已打开', (q) => q.browserOpen)); };
    const goSite = (site, step = 'site') => {
      const a = box('textbox') && els.find((e) => e.role === 'textbox' && /输入网址/.test(e.label || ''));
      const ab = els.find((e) => e.role === 'textbox' && e.y < 140 && e.w > 500) || a;
      if (!ab) return openBrowser();
      if (!ab.focused) return click(ab, `点一下地址栏，准备输入 ${site}。`, step, ex('地址栏获得焦点', (q) => q.elements.some((e) => e.role === 'textbox' && e.focused)));
      if ((ab.value || '') === site) return { thought: '按回车打开网站。', step, action: { type: 'key', keys: 'Enter' }, expect: ex(`进入 ${site}`, (q) => (q.page || '').startsWith(site)) };
      if (ab.value) return { thought: '地址栏里有旧网址，先清空。', step, action: { type: 'key', keys: 'ctrl+l' }, expect: ex('地址栏已清空', (q) => !q.elements.find((e) => e.role === 'textbox' && e.focused)?.value) };
      return { thought: `输入网址 ${site}。`, step, action: { type: 'type', text: site }, expect: ex('网址已输入', (q) => q.elements.some((e) => e.role === 'textbox' && e.focused && e.value === site)) };
    };
    if (g.kind === 'rest') return { thought: '有点累了，离开电脑休息一下。', step: 'rest', action: { type: 'rest' }, then: 'finish', thenNote: '能量恢复' };
    if (g.kind === 'diary') {
      if (!p.notesOpen) { const b = els.find((e) => e.role === 'button' && /^记事本/.test(e.label) && e.y > 700) || btn(/^记事本/); return click(b, '打开记事本写日记。', 'open', ex('记事本已打开', (q) => q.notesOpen)); }
      const ta = els.find((e) => e.role === 'textarea' && /写点什么/.test(e.label || ''));
      if (!ta) { const b = els.find((e) => e.role === 'button' && /^记事本/.test(e.label) && e.y > 700); return click(b, '把记事本切到前面。', 'open', ex('记事本在最前', (q) => q.elements.some((e) => e.role === 'textarea' && /写点什么/.test(e.label || '')))); }
      if (!ta.focused && !(ta.value || '').length) return click(ta, '点进输入框。', 'write', ex('输入框获得焦点', (q) => q.elements.some((e) => e.role === 'textarea' && e.focused)));
      if (!(ta.value || '').length) { this.mem.diaryAt = ctx.step; return { thought: '写下今天的感受。', step: 'write', action: { type: 'type', text: diaryText(ctx) }, expect: ex('日记已写好', (q) => q.elements.some((e) => e.role === 'textarea' && (e.value || '').length > 5)) }; }
      return { ...click(btn(/保存日记/), '保存日记。', 'save', ex('日记已保存', (q) => q.elements.some((e) => /已保存/.test(e.label)))), then: 'finish', thenNote: '日记已保存' };
    }
    if (g.kind === 'eat') {
      const recv = btn(/^确认收货/);
      if (recv) return { ...click(recv, '外卖到了，确认收货开吃。', 'eat', ex('用餐完成', (q, r) => !!r.eat)), then: 'finish', thenNote: '吃饱了' };
      if (/配送中/.test(txt)) return { thought: '骑手正在路上，再等等。', step: 'deliver', action: { type: 'wait', minutes: 5, reason: '等待骑手送达' } };
      if (/等待守护者批准支付/.test(txt) && ctx.energy < 20) return { thought: `审批还没回来，我已经很累了（能量 ${Math.round(ctx.energy)}），先离开电脑休息一下。`, step: 'approve', action: { type: 'rest' } };
      if (/等待守护者批准支付/.test(txt)) return { thought: '支付请求在等守护者批准，我先不动。', step: 'approve', action: { type: 'wait', minutes: 3, reason: '等待支付审批' } };
      if (/支付被拒绝|预算策略拒绝/.test(txt) && /waimai\.sandbox\/order/.test(addr || '') && g.submitted) { this.mem.denied = (this.mem.denied || 0) + 1; return { thought: '支付没有被批准，这顿先不吃了，记住要更省着点。', step: 'submit', finish: { status: 'failed', note: '支付未获批准' }, action: { type: 'wait', minutes: 1 } }; }
      if (!p.browserOpen) return openBrowser();
      if (!(addr || '').startsWith('waimai.sandbox')) return goSite('waimai.sandbox');
      if (addr === 'waimai.sandbox/checkout') { const s = btn(/^提交订单并支付/); if (s) { g.submitted = true; return click(s, `确认金额 ${s.label.match(/\$[\d.]+/)?.[0]}，提交订单。付款需要守护者批准。`, 'submit', ex('订单已提交，支付请求已发出', (q, r) => !!r.payment)); } }
      if (/^waimai\.sandbox\/shop\//.test(addr || '')) {
        const cart = els.find((e) => /^购物车 \d+ 件/.test(e.label));
        if (cart && g.pick?.done) return click(btn(/^去结算/), `购物车里有 ${cart.label.match(/\d+/)[0]} 件，去结算。`, 'checkout', ex('进入结算页', (q) => q.page === 'waimai.sandbox/checkout'));
        const dishes = els.filter((e) => e.role === 'text' && /饱腹 \d+/.test(e.label)).map((e) => { const m = e.label.match(/^(.+?) · (主食|小份) · 饱腹 (\d+) · \$([\d.]+)/); return m && { name: m[1], main: m[2] === '主食', sat: +m[3] / 100, price: +m[4] }; }).filter(Boolean);
        if (!g.pick) {
          const budget = Math.min(ctx.wallet.balance, ctx.policy.dailyCapUsd - ctx.policy.spentToday) - 0.8;
          const mains = dishes.filter((d) => d.main && d.price <= budget);
          if (!mains.length) return { thought: '这家店我吃不起，换一家便宜点的。', step: 'shop', action: { type: 'click', ...center(btn(/^后退/)) }, expect: ex('回到餐厅列表', (q) => q.page === 'waimai.sandbox') };
          const frugal = ctx.dna.genome.frugality > 0.6;
          const main = frugal ? mains.sort((a, b) => a.price - b.price)[0] : mains.sort((a, b) => b.sat / b.price - a.sat / a.price)[0];
          const want = [main.name]; const side = dishes.filter((d) => !d.main && d.price + main.price <= budget).sort((a, b) => a.price - b.price)[0];
          if (side && ctx.hunger > 0.85) want.push(side.name);
          g.pick = { want, done: false, i: 0 }; this.say(`${frugal ? '我比较节俭，' : ''}点「${want.join('」+「')}」，预计 $${(want.reduce((s, n) => s + dishes.find((d) => d.name === n).price, 0) + 0.8).toFixed(2)}（含配送费）。`, 'plan');
        }
        const name = g.pick.want[g.pick.i]; const add = btn(new RegExp('^加入购物车：' + name));
        if (add) { g.pick.i++; if (g.pick.i >= g.pick.want.length) g.pick.done = true; return click(add, `把「${name}」加入购物车。`, 'dish', ex('已加入购物车', (q) => q.elements.some((e) => /^购物车 \d+ 件/.test(e.label)))); }
        g.pick.done = true;
      }
      if (addr === 'waimai.sandbox') {
        const cards = els.filter((e) => e.role === 'button' && /分 · 约 \d+ 分钟/.test(e.label));
        const parse = (e) => ({ e, name: e.label.split(' · ')[0], rating: +(e.label.match(/([\d.]+) 分/)?.[1] || 0), eta: +(e.label.match(/约 (\d+) 分钟/)?.[1] || 60) });
        let list = cards.map(parse); if (ctx.dna.genome.openness > 0.6 && this.mem.lastShop) list = list.filter((x) => x.name !== this.mem.lastShop).concat(list.filter((x) => x.name === this.mem.lastShop));
        const pick = ctx.dna.genome.openness > 0.6 ? list[(this.mem.orders || 0) % list.length] : list.sort((a, b) => b.rating - a.rating || a.eta - b.eta)[0];
        this.mem.lastShop = pick.name; this.mem.orders = (this.mem.orders || 0) + 1;
        return click(pick.e, `选「${pick.name}」，${pick.rating} 分，约 ${pick.eta} 分钟送达。`, 'shop', ex('进入餐厅页面', (q) => /^waimai\.sandbox\/shop\//.test(q.page || '')));
      }
      if (/waimai\.sandbox\/order/.test(addr || '')) { const back = btn(/^返回首页/); if (back) return click(back, '回到外卖首页。', 'shop', ex('回到首页', (q) => q.page === 'waimai.sandbox')); }
      return goSite('waimai.sandbox');
    }
    // work
    if (/客户已验收并付款|客户要求返工/.test(txt) && /jobs\.sandbox\/gig/.test(addr || '') && !g.submitted) { const back = btn(/^返回任务列表/); if (back) return click(back, '回到任务列表找新活。', 'pick', ex('回到任务列表', (q) => q.page === 'jobs.sandbox')); }
    if (/客户已验收并付款|客户要求返工/.test(txt) && /jobs\.sandbox\/gig/.test(addr || '') && g.submitted) { this.mem.gigsDone++; return { thought: /已验收/.test(txt) ? '交付通过，钱到账了。' : '这次被要求返工，下次写得更具体些。', step: 'paid', finish: { status: 'done', note: /已验收/.test(txt) ? '收到报酬' : '被要求返工' }, action: { type: 'wait', minutes: 1 } }; }
    if (!p.browserOpen) return openBrowser();
    if (!(addr || '').startsWith('jobs.sandbox')) return goSite('jobs.sandbox');
    if (addr === 'jobs.sandbox') {
      const jobs = els.filter((e) => e.role === 'button' && /技能：/.test(e.label)).map((e) => ({ e, title: e.label.split(' · ')[0], reward: +(e.label.match(/\$([\d.]+)/)?.[1] || 0), mine: ctx.persona.skills.some((s) => e.label.includes('技能：' + s.replace(' 编程', ''))) }));
      const best = jobs.sort((a, b) => b.reward * (b.mine ? 1.6 : 1) - a.reward * (a.mine ? 1.6 : 1))[0];
      return click(best.e, `接这个：「${best.title}」，报酬 $${best.reward}${best.mine ? '，正好是我的专长' : ''}。`, 'pick', ex('打开任务详情', (q) => /^jobs\.sandbox\/gig\//.test(q.page || '')));
    }
    const ta = els.find((e) => e.role === 'textarea' && /交付内容/.test(e.label || ''));
    if (ta) {
      if (!ta.focused && [...(ta.value || '')].length < 20) return click(ta, '点进交付内容的输入框。', 'write', ex('输入框获得焦点', (q) => q.elements.some((e) => e.role === 'textarea' && e.focused && /交付内容/.test(e.label || ''))));
      if ([...(ta.value || '')].length < 20) { const title = els.find((e) => e.role === 'text' && e.y < 240 && e.y > 150)?.label || '任务'; return { thought: '认真写交付内容，并注明由 AI 完成。', step: 'write', action: { type: 'type', text: deliverable(title, ctx) }, expect: ex('交付内容已写好', (q) => q.elements.some((e) => e.role === 'textarea' && [...(e.value || '')].length >= 20)) }; }
      g.submitted = true;
      return click(btn(/^提交成果/), '写好了，提交成果。', 'submit', ex('客户给出了结果', (q) => q.elements.some((e) => /客户已验收|客户要求返工/.test(e.label))));
    }
    return goSite('jobs.sandbox');
  }

  // ---------- 视觉 LLM（OpenAI 兼容） ----------
  async llmDecide(obs, ctx) {
    const g = this.goal; const recent = this.actions.slice(-6).map((a) => `- ${a.clock} ${JSON.stringify(a.action)} → ${a.result}${a.verify ? `（${a.verify.ok ? '校验通过' : '校验失败'}：${a.verify.text}）` : ''}`).join('\n');
    const sys = [
      `你是「${ctx.persona.name}」，一个虚构的 AI 角色，正在第一人称操作守护者指定的一台本地电脑（${this.target.kind === 'sandbox' ? '内置沙盒桌面' : 'VNC 虚拟机'}）。`,
      '你只能通过键鼠动作操作屏幕，像人一样看屏幕、移动鼠标、点击、输入。',
      '规则：只做合法、诚实的事；不冒充真人；不绕过验证码与风控；对外交流表明自己是 AI。',
      '任何付款：在点击最终支付按钮之前，必须先输出 {"type":"request_payment","amount":数字,"merchant":"商户","memo":"用途"} 并等待守护者批准（你会在后续观察中看到批准结果）。内置沙盒的“提交订单并支付”按钮会自动发起审批。',
      '每步只输出一个 JSON：{"thought":"简短中文想法","step":"当前计划步骤 id","action":{...}}。',
      'action 可选：{"type":"click","x":数,"y":数} | {"type":"double_click","x":数,"y":数} | {"type":"move","x":数,"y":数} | {"type":"type","text":"..."} | {"type":"key","keys":"Enter / ctrl+l / Backspace"} | {"type":"scroll","dy":300} | {"type":"wait","minutes":数} | {"type":"request_payment",...} | {"type":"done"}。',
      '坐标单位为屏幕像素，原点在左上角。',
    ].join('\n');
    const user = `目标：${g.title}（原因：${g.why}）\n计划：${g.plan.map((s) => `${s.id}=${s.title}[${s.status}]`).join('，')}\n身体：饥饿 ${Math.round(ctx.hunger * 100)}%，能量 ${Math.round(ctx.energy)}，钱包余额 $${ctx.wallet.balance}，今日已花 $${ctx.policy.spentToday}/${ctx.policy.dailyCapUsd}\n${ctx.approvalNote ? '审批消息：' + ctx.approvalNote + '\n' : ''}${ctx.instruction ? '【守护者指令】' + ctx.instruction + '\n' : ''}${ctx.memories?.length ? '相关记忆：\n' + ctx.memories.map((m) => '- ' + m.text).join('\n') + '\n' : ''}最近动作：\n${recent || '（无）'}\n\n当前屏幕：\n${obs.text}`;
    const content = obs.image && llmConfig().vision ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: obs.image } }] : user;
    const out = await chatJSON([{ role: 'system', content: sys }, { role: 'user', content }]);
    if (!out.action || !out.action.type) throw new Error('模型输出缺少 action');
    const a = out.action; if (obs.shotWidth && obs.shotWidth !== obs.width && (a.x != null)) { /* 模型基于缩略图坐标时换算 */ if (out.coords === 'shot') { const k = obs.width / obs.shotWidth; a.x = Math.round(a.x * k); a.y = Math.round(a.y * k); } }
    return { thought: String(out.thought || ''), step: out.step, action: a };
  }
  reliability() { const r = this.rel; const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null); return { ...r, verifyRate: pct(r.verifyOk, r.verified), goalRate: pct(r.done, r.done + r.failed) }; }
  // ---------- 外部事件 ----------
  onPayment(ref, outcome, info) { if (ref.kind !== 'vnc') this.os.onPayment(ref, outcome, info); if (outcome === 'rejected') this.rejectPending = true; this.approvalNote = outcome === 'paid' ? `守护者已批准并完成支付（凭证 ${info.tx}）` : outcome === 'denied' ? `支付被预算策略拒绝：${info.reason}` : '守护者拒绝了这笔支付'; this.say(`支付结果：${this.approvalNote}`, outcome === 'paid' ? 'done' : 'fail'); }
  async humanAct(a) { const res = a.type === 'wait' ? { ok: true, message: '等待' } : await this.driver.act(a); this.lastAction = { id: ++this.aseq, clock: '', action: a, result: res.message, ok: res.ok, human: true }; this.actions.push(this.lastAction); if (this.rec) this.rec.steps.push({ ...this.lastAction, frame: this.driver.frameForRecording() }); return res; }
  view() {
    return {
      active: this.active, target: this.target && { id: this.target.id, name: this.target.name, kind: this.target.kind, host: this.target.host, port: this.target.port },
      status: this.driver?.status || { state: 'unbound' }, screen: this.driver?.view() || null,
      goal: this.goal && { id: this.goal.id, title: this.goal.title, why: this.goal.why, kind: this.goal.kind, plan: this.goal.plan, steps: this.goal.steps, started: this.goal.started },
      thoughts: this.thoughts.slice(-24), actions: this.actions.slice(-40).map(({ frame, ...a }) => a), last: this.lastAction, recordings: this.listRecordings(), reliability: this.reliability(),
      orders: this.os.orders.slice(-6), llm: llmEnabled() && process.env.ALOS_CUA_RULES !== '1' ? llmConfig().model : null,
    };
  }
  serialize() { return { os: this.os.serialize(), mem: this.mem, goal: this.goal, rel: this.rel }; }
}
function diaryText(ctx) { const h = Math.round(ctx.hunger * 100); return `${ctx.clock}。今天在电脑前工作，余额 $${ctx.wallet.balance}，饥饿 ${h}%。${ctx.dna.genome.neuroticism > 0.6 ? '有点焦虑，但我会照顾好自己。' : '一切按计划进行。'}`; }
function deliverable(title, ctx) { return `【由 AI 完成】${title}：已按要求完成初稿，结构清晰、要点完整，包含背景、方案与下一步建议；如需修改请留言，我会在 24 小时内更新。——${ctx.persona.name}`; }
module.exports = { DesktopSession, SandboxDriver, VncDriver, PLANS, ACTION_TYPES };
