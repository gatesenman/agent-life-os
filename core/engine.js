'use strict';
const { EventEmitter } = require('events');
const path = require('path');
const { generateDNA } = require('./dna');
const { buildPersona } = require('./persona');
const { SimWorld } = require('./world/simWorld');
const { buildAdapters } = require('./adapters');
const { BudgetPolicy } = require('./policy');
const { Memory } = require('./memory');
const { decide } = require('./brain');
const { llmEnabled, llmConfig } = require('./llm');
const { checkInvariants } = require('./formula');
const { Society } = require('./life/society');
const G = require('./life/genetics');
const { DesktopSession } = require('./desktop/session');

const SNAPSHOT_EVERY = 5;
const APPROVAL_TTL_MS = 15 * 60 * 1000;

// 智能体引擎 = 一个世界。实现 S(t+1) = F(S(t), a(t), h(t); R, σ)，见 formula.js
class AgentEngine extends EventEmitter {
  constructor({ dataDir = path.join(process.cwd(), '.alos-data'), seed, dnaOverrides, worldMode = process.env.ALOS_WORLD || 'sim', tickMs = Number(process.env.ALOS_TICK_MS || 1500),
    worldId = 'w0', name = '主世界', parentId = null, forkStep = null, branchSeed = '', policyOverrides = {}, lifeOverrides = {}, restore = null, color = null, desktop = null, resumed = false } = {}) {
    super();
    this.opts = { dataDir, seed, dnaOverrides, worldMode, tickMs };
    this.meta = { worldId, name, parentId, forkStep, branchSeed, color, createdAt: Date.now() };
    this.policyOverrides = policyOverrides; this.lifeOverrides = lifeOverrides; this.restoreState = restore; this.desktopTarget = desktop; this.resumed = resumed;
    this.timeline = []; this.approvals = []; this.snapshots = []; this.violations = [];
    this.stats = { steps: 0, earned: 0, spent: 0, rejectedTasks: 0 };
    this.seq = 0; this.cause = undefined;
    this.running = false; this.paused = false; this.takeover = false; this.instruction = null; this.busy = false;
  }

  log(kind, text, extra = {}) {
    const seq = ++this.seq;
    const e = { id: `${this.meta.worldId}:${seq}`, seq, step: this.stats.steps, at: Date.now(), clock: this.world?.clock?.() || '', kind, text, ...extra };
    if (e.cause === undefined && this.cause !== undefined && ['result', 'money', 'payment'].includes(kind)) e.cause = this.cause;
    this.timeline.push(e); if (this.timeline.length > 500) this.timeline.shift();
    this.memory?.add(kind, text);
    this.memory?.audit({ world: this.meta.worldId, kind, text, ...extra });
    this.emit('event', e);
    return e;
  }

  async init() {
    this.dna = generateDNA(this.opts.seed, this.opts.dnaOverrides);
    this.persona = buildPersona(this.dna);
    this.memory = new Memory(path.join(this.opts.dataDir, this.dna.fingerprint, this.meta.worldId), { fresh: !this.restoreState });
    this.policy = new BudgetPolicy({ dailyCapUsd: this.dna.economy.daily_spend_cap_usd, autoApproveBelowUsd: Number(process.env.ALOS_AUTO_APPROVE_BELOW_USD || this.dna.economy.auto_approve_below_usd), ...this.policyOverrides });
    this.adapters = buildAdapters({ persona: this.persona, dna: this.dna, log: (t) => this.log('system', t) });
    this.identity = {};
    const R = this.restoreState;
    this.configRevision = R?.configRevision || 0; this.configUndo = R?.configUndo || null;
    for (const [k, a] of Object.entries(this.adapters)) {
      if (R && k === 'payment' && a.restore) { a.restore(R.payment); this.identity[k] = a.card; continue; }
      try { this.identity[k] = await a.provision(); } catch (e) { this.log('system', `${k} 适配器开通失败：${e.message}`); }
    }
    if (R) {
      this.world = SimWorld.restore(R.world, { branchSeed: this.meta.branchSeed });
      this.memory.restore(R.memory);
      this.timeline = this.resumed ? R.timeline.slice() : R.timeline.map((e) => ({ ...e, inherited: true })); this.seq = R.seq; this.stats = { ...R.stats };
      this.policy.spentToday = R.policy.spentToday; this.policy.day = R.policy.day;
      this.snapshots = R.snapshots ? R.snapshots.slice() : [];
      this.society = R.society ? Society.restore(R.society, { branchSeed: this.meta.branchSeed, config: this.resumed ? null : this.lifeOverrides }) : this.newSociety();
      if (this.resumed) this.approvals = (R.approvals || []).slice();
      // 分叉时改写主角性格 = 在该分支中直接改写主角的基因（不经遗传，不违反 L9：L9 只约束出生）
      const og = this.resumed ? {} : (this.opts.dnaOverrides || {}).genome || {}; const fp = this.society.focus();
      if (fp) for (const [t, v] of Object.entries(og)) if (fp.alleles[t]) { fp.alleles[t] = [v, v]; if (fp.drift) fp.drift[t] = 0; }
      this.applyFocus(true);
      if (this.resumed) this.log('system', `应用重新打开：「${this.meta.name}」从第 ${this.stats.steps} 步（${this.world.clock()}）继续，世界状态、钱包、记忆与待审批均已恢复。`);
      else this.log('system', `从「${R.fromName}」第 ${this.meta.forkStep} 步分叉而来${this.meta.branchSeed ? `，分支种子 ${this.meta.branchSeed}` : ''}。此后与原世界互不影响。`, { fork: true });
    } else {
      if (this.opts.worldMode === 'qemu') {
        const { QemuWorld } = require('./world/qemuWorld');
        this.world = new QemuWorld();
        try { await this.world.start(); } catch (e) { this.log('system', `QEMU 启动失败，回退到模拟世界：${e.message}`); this.world = null; }
      }
      if (!this.world) this.world = new SimWorld({ seed: this.dna.seed, skills: this.dna.skills, branchSeed: this.meta.branchSeed });
      this.adapters.payment.ledger.forEach((t) => { t.clock = this.world.clock?.(); t.cause = 'genesis'; });
      this.society = this.newSociety();
      for (const e of this.society.drain()) this.log('life', e.text, { life: e.type, cause: 'genesis' });
      this.log('system', `${this.persona.name} 在「${this.world.kind === 'sim' ? '模拟世界' : 'QEMU 虚拟机'}」中醒来。大脑：${llmEnabled() ? 'LLM ' + llmConfig().model : '规则策略（未配置 LLM）'}。`);
      this.takeSnapshot();
    }
    this.desktop = new DesktopSession({ seed: this.dna.seed, branchSeed: this.meta.branchSeed, skills: this.dna.skills, recordDir: path.join(this.opts.dataDir, this.dna.fingerprint, this.meta.worldId, 'recordings'), state: R?.desktop });
    this.desktop.os.address = this.homeName();
    this.desktop.on('frame', () => this.emit('frame'));
    this.desktop.held = () => this.takeover;
    // 内置沙盒可随平行世界分叉；VNC 是一台真实机器，无法分叉——分叉出的世界改用内置沙盒
    const dt = this.desktopTarget || (R?.desktopKind === 'sandbox' ? { id: 'sandbox', kind: 'sandbox', name: '内置沙盒桌面' } : null);
    if (dt) await this.bindDesktop(dt, true);
    this.expireApprovals();
    this.emitState();
    return this;
  }
  homeName() { const f = this.society?.focus(); const pl = f && this.society.places?.find((q) => q.id === f.home); return pl?.name || '住宅'; }
  // 换电脑 / 解绑：上一台电脑上的待审批订单随目标一起作废（不扣款），避免之后误批一笔已放弃的订单
  cancelDesktopApprovals(why) {
    for (const a of this.approvals.filter((x) => x.desktop)) {
      this.approvals = this.approvals.filter((x) => x.id !== a.id);
      this.log('payment', `${why}，作废待审批的「${a.memo}」$${a.amount}（未扣款）`);
      try { this.desktop.onPayment(a.desktop, 'cancelled', {}); } catch {}
    }
  }
  async bindDesktop(target, silent) {
    if (this.desktop.target && this.desktop.target.id !== target.id) this.cancelDesktopApprovals(`换到「${target.name}」`);
    const st = await this.desktop.bind(target);
    if (!silent) this.log('human', `观察者把「${target.name}」绑定给 ${this.persona.name}${st.state === 'error' ? `（连接失败：${st.error}）` : ''}。从现在起，智能体以第一人称操作这台电脑。`);
    this.emitState(); return st;
  }
  unbindDesktop() { const n = this.desktop.target?.name; this.cancelDesktopApprovals(`解除「${n}」的绑定`); this.desktop.unbind(); this.log('human', `观察者解除了「${n}」的绑定，智能体回到经典任务板世界。`); this.emitState(); }
  async desktopHumanAct(a) {
    if (!this.takeover) throw new Error('需要先接管，才能手动操作这台电脑');
    const he = this.log('human', `[人工操作电脑] ${describe(a)}`, { action: a, desktop: true }); this.cause = he.id;
    const res = await this.desktop.humanAct(a); this.log('result', res.message, { ok: res.ok, cause: he.id });
    if (res.payment) await this.requestPayment({ ...res.payment, cause: he.id });
    if (res.eat) this.doEat(res.eat, he.id);
    this.cause = undefined; this.emitState(); return res;
  }
  doEat(eat, cause) {
    const before = this.world.hunger; this.world.eat(eat.satiety); this.ateThisStep = eat;
    this.log('life', `${this.persona.name} 吃完了${eat.order ? `外卖（订单 ${eat.order}）` : '饭'}，饥饿 ${Math.round(before * 100)}% → ${Math.round(this.world.hunger * 100)}%。`, { life: 'eat', cause });
    const f = this.society?.focus(); if (f && f.emo) f.emo.joy = Math.min(1, Math.round((f.emo.joy + 0.1) * 1e4) / 1e4);
  }

  newSociety() {
    const env = {};
    if (process.env.ALOS_YEARS_PER_DAY) env.yearsPerDay = Number(process.env.ALOS_YEARS_PER_DAY);
    if (process.env.ALOS_START_ERA) env.startEra = process.env.ALOS_START_ERA;
    return new Society({ seed: this.dna.seed, branchSeed: this.meta.branchSeed, dna: this.dna, persona: this.persona, config: { ...env, ...this.lifeOverrides } });
  }
  // 主角 = 社会中的 focus 个体：去世后由继承人接续（人格、年龄、性状随之改变）
  applyFocus(silent) {
    const f = this.society.focus();
    if (!f) return;
    if (this.focusId && this.focusId !== f.id && !silent) {
      this.log('system', `主角更替：${this.persona.name} → ${f.name}（第 ${f.gen} 代）。这台电脑与钱包的使用权随之转交，账户在法律上仍归人类操作者所有。`);
    }
    this.focusId = f.id;
    const ph = G.phenotype(f);
    this.persona = { ...this.persona, name: f.name, age: Math.floor(this.society.age(f)), generation: f.gen };
    this.dna = { ...this.dna, genome: Object.fromEntries(Object.keys(this.dna.genome).map((k) => [k, ph[k] ?? this.dna.genome[k]])) };
  }
  // ---------- 与虚拟人对话（人类输入 h(t)，写入记忆流） ----------
  talkTo(personId, text) {
    const msg = String(text || '').trim().slice(0, 400); if (!msg) throw new Error('请输入要对 TA 说的话');
    const p = this.society.persons[personId]; if (!p) throw new Error('这个人不存在');
    if (p.died !== null) throw new Error('已故之人不可交谈（L8 必死律）');
    const before = this.society.probe();
    const he = this.log('human', `观察者对 ${p.name} 说：「${msg}」`);
    const rec = this.society.talkTo(personId, msg, { hunger: this.world?.hunger, balance: this.adapters.payment.balance, plan: this.memory?.plan?.items?.join('；'), clock: this.world?.clock?.() });
    for (const e of this.society.drain()) this.log('life', e.text, { life: e.type, cause: he.id });
    if (personId === this.society.focusId) {
      this.memory.add('human', `观察者对我说：「${msg}」`);
      this.memory.remember(`观察者对我说：「${msg}」。我回答：「${rec.reply}」。`, 'talk', this.world?.clock?.(), this.society?.year, { personId, sourceId: he.id, replySource: 'rules' });
    }
    const prev = { time: this.world.absMinutes?.(), society: before, hunger: this.world.hunger };
    this.checkLife(before);
    const v = require('./formula').checkInvariants(this, prev);
    for (const x of v) { this.violations.push({ step: this.stats.steps, ...x }); this.log('error', `违反定律 ${x.law}（${x.name}）：${x.msg}`); }
    this.emitState();
    return rec;
  }
  // 快进到饥饿：只推进世界时间（L17：饥饿只随时间上升），不代替智能体下单，也不改写余额
  async fastForwardHunger(target = 0.72) {
    if (this.busy) throw new Error('世界正在结算上一步，请稍后再试');
    const t = Math.max(this.world.hunger || 0, Math.min(1, Number(target) || 0.72));
    const need = Math.max(0, t - (this.world.hunger || 0));
    const mins = Math.ceil(need / 0.05 * 60);
    const he = this.log('human', mins === 0
      ? `观察者请求快进到饥饿 ${Math.round(t * 100)}%，当前已是 ${Math.round((this.world.hunger || 0) * 100)}%。`
      : `观察者快进世界时间 ${mins} 分钟，使饥饿随代谢上升到约 ${Math.round(t * 100)}%（遵循 L17：饥饿只随时间上升，不会凭空增加或减少）。`);
    if (mins <= 0) { this.emitState(); return { hunger: this.world.hunger, minutes: 0, already: true }; }
    this.busy = true; this.ateThisStep = null; this.lastDesktopAction = null;
    const prev = { time: this.world.absMinutes?.(), society: this.society.probe(), hunger: this.world.hunger };
    try {
      this.world.advance(mins);
      const evs = this.society.advance(mins / 1440 * this.society.config.yearsPerDay, { hour: (this.world?.minute ?? 720) / 60, day: this.world?.day || 1 });
      for (const e of evs) this.log('life', e.text, { life: e.type, cause: he.id });
      this.applyFocus();
      const f = this.society.focus();
      if (f && f.needs && this.world.hunger !== undefined) f.needs.phys = Math.round(Math.min(f.needs.phys, 1 - this.world.hunger) * 1e4) / 1e4;
      this.stats.steps++;
      const v = require('./formula').checkInvariants(this, prev);
      for (const x of v) { this.violations.push({ step: this.stats.steps, ...x }); this.log('error', `违反定律 ${x.law}（${x.name}）：${x.msg}`); }
      return { hunger: this.world.hunger, minutes: mins, violations: v.length };
    } finally { this.busy = false; this.cause = undefined; this.emitState(); }
  }
  // ---------- 生命层：人类天启（God Mode） ----------
  lifeConfig(input) {
    const patch = input?.patch || input || {};
    if (input?.expectedRevision != null && input.expectedRevision !== (this.configRevision || 0)) throw new Error('法则已被更改，请刷新预览后再应用');
    const changes = require('./configuration').previewConfig(this.society.config, patch);
    if (!changes.length) return {};
    this.configUndo = Object.fromEntries(changes.map((x) => [x.key, x.before]));
    const c = this.society.setConfig(Object.fromEntries(changes.map((x) => [x.key, x.after])));
    this.configRevision = (this.configRevision || 0) + 1;
    this.log('human', `观察者调整了世界法则：${changes.map((x) => `${x.title} ${x.before} → ${x.after}`).join('，')}`);
    this.emitState(); return c;
  }
  undoConfig(expectedRevision) {
    if (expectedRevision !== (this.configRevision || 0)) throw new Error('法则版本已变，请刷新后重试');
    if (!this.configUndo) throw new Error('没有可撤销的法则修改');
    this.society.setConfig(this.configUndo); this.configUndo = null; this.configRevision++;
    this.log('human', '观察者撤销了上一轮法则调整；仅恢复规则，不倒流时间、不复活死者。'); this.emitState();
  }
  godEvent(type) {
    const he = this.log('human', `观察者发动天启：${{ plague: '降下瘟疫', disaster: '降下天灾', bounty: '风调雨顺', insight: '赐予灵感', peace: '调停冲突' }[type] || type}`);
    const prev = this.society.probe();
    this.society.stepBirths = [];
    this.society.godEvent(type);
    for (const e of this.society.drain()) this.log('life', e.text, { life: e.type, cause: he.id });
    this.applyFocus(); this.checkLife(prev); this.emitState();
  }
  editPlace(op) { const he = this.log('human', `观察者编辑地点：${{ add: '新建', move: '移动', remove: '拆除', rename: '改名' }[op.op] || op.op}`); const r = this.society.editPlace(op); for (const e of this.society.drain()) this.log('life', e.text, { life: e.type, cause: he.id }); this.emitState(); return r; }
  checkLife(prev) {
    for (const [law, msg] of this.society.checkLaws(prev)) { const { LAWS } = require('./formula'); this.violations.push({ step: this.stats.steps, law, name: LAWS[law], msg }); this.log('error', `违反定律 ${law}（${LAWS[law]}）：${msg}`); }
  }

  // ---------- 快照与分叉 ----------
  exportState() {
    return JSON.parse(JSON.stringify({
      configRevision: this.configRevision, configUndo: this.configUndo,
      world: this.world.serialize ? this.world.serialize() : null, payment: this.adapters.payment.serialize(), memory: this.memory.serialize(),
      timeline: this.timeline.slice(-200), seq: this.seq, stats: this.stats, policy: this.policy.serialize(), fromName: this.meta.name, society: this.society.serialize(),
      desktop: this.desktop?.serialize(), desktopKind: this.desktop?.target ? 'sandbox' : null,
    }));
  }
  // 应用重启后的续存：完整状态 + 待审批 + 最近快照（供之后继续分叉）
  persistState() {
    const st = this.exportState();
    st.approvals = JSON.parse(JSON.stringify(this.approvals));
    st.snapshots = this.snapshots.length > 8 ? [this.snapshots[0], ...this.snapshots.slice(-7)] : this.snapshots;
    return {
      meta: this.meta, opts: { seed: this.opts.seed ?? this.dna.seed, dnaOverrides: this.opts.dnaOverrides, tickMs: this.opts.tickMs },
      policyOverrides: this.policyOverrides, lifeOverrides: this.lifeOverrides, running: this.running, paused: this.paused, state: st,
    };
  }
  takeSnapshot() {
    if (!this.world.serialize) return;
    const st = this.exportState();
    this.snapshots.push({ step: this.stats.steps, clock: this.world.clock(), balance: this.adapters.payment.balance, energy: this.world.energy, state: st });
    if (this.snapshots.length > 40) this.snapshots.splice(1, 1); // 保留创世快照
  }
  snapshotAt(step) {
    if (step === undefined || step === null || step >= this.stats.steps) return { step: this.stats.steps, state: this.exportState() };
    let best = this.snapshots[0];
    for (const s of this.snapshots) if (s.step <= step) best = s;
    return best;
  }

  // ---------- 人类输入 h(t) ----------
  start() { if (this.running) return; this.running = true; this.paused = false; this.log('human', '观察者启动了世界时钟。'); this.loop(); this.emitState(); }
  stop() { this.desktop?.invalidateExecution(); this.desktop?.unbind(); this.running = false; clearTimeout(this.timer); this.world?.stop?.(); }
  pause() { this.desktop?.invalidateExecution(); this.paused = true; this.log('human', '观察者暂停了这个世界。'); this.emitState(); }
  resume() { this.paused = false; this.log('human', '观察者恢复了这个世界。'); this.emitState(); if (this.running) this.loop(); }
  cancelGoal() { this.desktop?.invalidateExecution(); this.cancelDesktopApprovals('取消当前目标'); this.desktop?.finishGoal('failed', '观察者取消；下次启动将根据当前需求重新规划'); this.pause(); }
  setTakeover(on) { if (on) this.desktop?.invalidateExecution(); this.takeover = !!on; this.log('human', on ? '观察者接管了世界（智能体暂停，人工操作）。' : '观察者交还了控制权。'); this.emitState(); }
  inject(text) { this.instruction = String(text).slice(0, 500); this.log('human', `观察者下达指令：${this.instruction}`); this.emitState(); }
  setSpeed(ms) { this.opts.tickMs = Math.max(100, Number(ms) || 1500); this.emitState(); }

  loop() {
    clearTimeout(this.timer);
    if (!this.running) return;
    this.timer = setTimeout(async () => { if (!this.paused && !this.takeover) await this.step(); this.loop(); }, this.opts.tickMs);
  }

  // ---------- 一次状态转移 ----------
  async step() {
    if (this.busy) return;
    if (this.takeover && this.desktop?.active) return; // L18：接管期间智能体不得操作电脑
    this.busy = true; const t0 = Date.now(); this.lastSource = null; const seq0 = this.seq;
    const prev = { time: this.world.absMinutes?.(), society: this.society.probe(), hunger: this.world.hunger };
    this.ateThisStep = null; this.lastDesktopAction = null;
    try {
      if (!this.society.focusId) { if (!this.ended) { this.ended = true; this.log('system', '血脉断绝：这个世界不再有主角，智能体循环停止。你仍可回看历史、对比平行世界。'); this.running = false; } return; }
      this.expireApprovals();
      this.policy.rollDay(this.world.day);
      let r;
      if (this.desktop?.active) r = await this.desktopStep();
      else {
        const obs = await this.world.observe();
        const wallet = this.adapters.payment.summary();
        const d = await decide({ persona: this.persona, dna: this.dna, obs, memory: this.memory, instruction: this.instruction, wallet, pendingPayments: this.approvals.length, step: this.stats.steps });
        this.instruction = null;
        this.lastSource = d.source; this.log('thought', d.thought, { source: d.source });
        r = await this.execute(d.action, 'agent');
      }
      if (r?.cancelled) return;
      // 生命层随世界时间推进：Δ年 = Δ分钟 / 1440 × 时间压缩
      const dMin = (this.world.absMinutes?.() ?? prev.time) - prev.time;
      const evs = this.society.advance(Math.max(0, dMin) / 1440 * this.society.config.yearsPerDay, { focusWorked: !!(r && r.earn), hour: (this.world?.minute ?? 720) / 60, day: this.world?.day || 1 });
      for (const e of evs) this.log('life', e.text, { life: e.type, cause: e.causeId || this.cause });
      this.applyFocus();
      const f = this.society.focus();
      // 饥饿进入马斯洛生理需求：主角的生理需求不高于 1 − 饥饿
      if (f && f.needs && this.world.hunger !== undefined) f.needs.phys = Math.round(Math.min(f.needs.phys, 1 - this.world.hunger) * 1e4) / 1e4;
      if (this.desktop?.active && this.society.focus()) this.desktop.os.address = this.homeName();
      if (f && this.world.energy !== undefined) { const cap = 30 + 70 * f.health; if (this.world.energy > cap) this.world.energy = Math.round(cap * 10) / 10; }
      this.stats.steps++;
      if (this.stats.steps % SNAPSHOT_EVERY === 0) this.takeSnapshot();
      this.cognition(r);
      const v = checkInvariants(this, prev);
      for (const x of v) { this.violations.push({ step: this.stats.steps, ...x }); this.log('error', `违反定律 ${x.law}（${x.name}）：${x.msg}`); }
      // v0.5 可观测性：每一步一条轨迹（耗时、决策来源、校验、事件数、定律检查）
      const la = this.timeline.filter((e) => e.seq > seq0 && e.kind === 'action').slice(-1)[0];
      this.traces = this.traces || []; this.traces.push({ step: this.stats.steps, clock: this.world.clock?.(), ms: Date.now() - t0, source: this.lastSource || 'rules', action: la ? la.text.slice(0, 40) : '', verify: la?.verify ? la.verify.ok : null, events: this.seq - seq0, laws: 18, violations: v.length });
      if (this.traces.length > 120) this.traces.shift();
    } catch (e) { this.log('error', `步骤出错：${e.message}`); if (process.env.ALOS_DEBUG) console.error(e); }
    finally { this.busy = false; this.cause = undefined; this.emitState(); }
  }

  // v0.5 认知层（记忆流 → 检索 → 反思 → 计划），只写心智，不改变钱/时间/人口（不影响 L1–L18）
  cognition(outcome = {}) {
    const m = this.memory; const day = this.world.day || 1;
    if (!m.plan || m.plan.day !== day || m.plan.personId && m.plan.personId !== this.society.focusId) { const p = m.makePlan(day, { hunger: this.world.hunger ?? 0, balance: this.adapters.payment.balance, energy: this.world.energy, personId: this.society.focusId, clock: this.world.clock(), year: this.society.year }); this.log('thought', `第 ${day} 天的计划：${p.items.join('；')}`, { source: 'plan' }); }
    m.updatePlan({ ...outcome, eat: outcome.eat || this.ateThisStep }, { personId: this.society.focusId, clock: this.world.clock(), sourceId: this.cause });
    if (m.shouldReflect()) { const ins = m.reflect(this.world.clock(), this.society?.year); this.log('thought', `反思（第 ${m.reflections} 次）：${ins.map((x) => x.text).join(' ')}`, { source: 'reflection' }); }
    if (this.stats.steps % 5 === 0) m.retrieve(this.desktop?.goal?.title || this.timeline.filter((e) => e.kind === 'thought').slice(-1)[0]?.text || '今天', 5);
  }

  // 第一人称 computer-use 步骤：截图/解析 → 决策 → 键鼠动作 → 校验
  async desktopStep() {
    const wallet = this.adapters.payment.summary();
    const ctx = { persona: this.persona, dna: this.dna, wallet, policy: this.policy.summary(), hunger: this.world.hunger, energy: this.world.energy, clock: this.world.clock(), absMinutes: this.world.absMinutes(), step: this.stats.steps, instruction: this.instruction, approvalNote: this.desktop.approvalNote, memories: llmEnabled() ? this.memory.retrieve(this.desktop.goal?.title || '下一步做什么', 4) : [], plan: this.memory.plan };
    this.instruction = null; this.desktop.approvalNote = null;
    const out = await this.desktop.tick(ctx);
    if (out.held) return { ok: true, cancelled: true };
    this.lastDesktopAction = out.action;
    this.lastSource = out.source; this.log('thought', out.thought, { source: out.source, desktop: true });
    const ae = this.log('action', describe(out.action), { action: out.action, desktop: true, verify: out.verify }); this.cause = ae.id;
    const r = out.result;
    // 世界时钟按整分钟推进；不足一分钟的动作时间累积到下一步（L4 时间之箭：每个动作 Δt > 0）
    this.minuteCarry = (this.minuteCarry || 0) + Math.max(0.2, r.minutes || 0.5); const whole = Math.floor(this.minuteCarry); this.minuteCarry -= whole;
    if (whole > 0) this.world.advance(whole, { resting: !!r.resting });
    if (r.resting) { this.world.energy = Math.min(100, this.world.energy + 35); this.world.mood = Math.min(1, this.world.mood + 0.05); }
    if (r.work) { this.world.energy = Math.max(0, this.world.energy - 8 * r.work); }
    this.log('result', r.message + (out.verify ? `（${out.verify.ok ? '校验通过' : '校验失败'}：${out.verify.text}）` : ''), { ok: r.ok, verify: out.verify, desktop: true });
    await this.applyOutcome(r, ae);
    if (r.eat) this.doEat(r.eat, ae.id);
    return r;
  }
  async applyOutcome(r, ae) {
    if (r.earn) {
      const etx = await this.adapters.payment.receive(r.earn);
      Object.assign(etx, { clock: this.world.clock?.(), day: this.world.day, cause: ae.id });
      this.stats.earned = +(this.stats.earned + r.earn.amount).toFixed(2);
      this.log('money', `收入 +$${r.earn.amount}（${r.earn.memo}）`);
    }
    if (r.rejected) this.stats.rejectedTasks++;
    if (r.diary) this.memory.remember(r.diary, 'diary', this.world.clock(), this.society?.year);
    if (r.payment) await this.requestPayment({ ...r.payment, cause: ae.id });
  }

  async execute(action, by = 'agent') {
    const ae = this.log(by === 'agent' ? 'action' : 'human', `${by === 'agent' ? '' : '[人工] '}${describe(action)}`, { action });
    this.cause = ae.id;
    const r = await this.world.act(action, { conscientiousness: this.dna.genome.conscientiousness });
    this.log('result', r.message, { ok: r.ok });
    await this.applyOutcome(r, ae);
    if (by !== 'agent') { this.cause = undefined; this.emitState(); }
    return r;
  }

  async requestPayment(req) {
    const wallet = this.adapters.payment.summary();
    const v = this.policy.check(req, wallet);
    if (v.verdict === 'deny') { this.log('payment', `支出被策略拒绝：${req.memo} $${req.amount}（${v.reason}）`, { cause: req.cause }); if (req.desktop) this.desktop.onPayment(req.desktop, 'denied', { reason: v.reason }); return; }
    // 支出永不自动批准。
    if (req.desktop && this.approvals.some((a) => a.desktop?.kind === req.desktop.kind && a.desktop?.id === req.desktop.id)) return;
    const ap = { amount: req.amount, merchant: req.merchant, memo: req.memo, itemId: req.itemId, desktop: req.desktop, cause: req.cause, id: `${this.meta.worldId}:ap${this.seq + 1}`, worldId: this.meta.worldId, worldName: this.meta.name, at: Date.now(), expiresAt: Date.now() + APPROVAL_TTL_MS, desktopSession: this.desktop?.sessionId, reason: v.reason };
    this.approvals.push(ap);
    this.log('payment', `申请支出 $${req.amount} 用于「${req.memo}」，等待人类审批。`, { approvalId: ap.id, cause: req.cause });
    this.emit('approval', ap);
  }

  expireApprovals(now = Date.now()) {
    for (const ap of this.approvals.slice()) {
      const staleVnc = ap.desktop?.kind === 'vnc' && ap.desktopSession !== this.desktop?.sessionId;
      if (staleVnc || now >= (ap.expiresAt || ap.at + APPROVAL_TTL_MS)) {
        this.approvals = this.approvals.filter((a) => a.id !== ap.id);
        if (ap.desktop) this.desktop?.onPayment(ap.desktop, 'cancelled', {});
        this.log('payment', `审批已失效：${ap.memo}（${staleVnc ? '电脑会话已改变' : '超过15分钟有效期'}，未扣款）`);
      }
    }
  }
  async approve(id) {
    // 串行结算：两笔同时批准时，后一笔必须看到前一笔更新后的预算与余额。
    const task = async () => {
      this.expireApprovals();
      const ap = this.approvals.find((a) => a.id === id); if (!ap) return false;
      this.approvals = this.approvals.filter((a) => a.id !== id);
      const he = this.log('human', `观察者批准了支出：${ap.memo} $${ap.amount}`);
      const ok = await this.settle({ ...ap, cause: he.id }, '人工批准'); this.emitState(); return ok;
    };
    const job = (this.settling || Promise.resolve()).then(task, task);
    this.settling = job.catch(() => {}); return job;
  }
  reject(id, why = '') {
    const ap = this.approvals.find((a) => a.id === id); if (!ap) return false;
    this.approvals = this.approvals.filter((a) => a.id !== id);
    this.log('human', `观察者拒绝了支出：${ap.memo} $${ap.amount}${why ? '（' + why + '）' : ''}`);
    this.memory.remember(`守护者拒绝了我购买「${ap.memo}」的请求，以后要更谨慎地花钱。`, 'lesson', this.world.clock(), this.society?.year);
    if (ap.desktop) this.desktop.onPayment(ap.desktop, 'rejected', {});
    this.emitState(); return true;
  }
  async settle(req, how) {
    this.policy.rollDay(this.world.day);
    const v = this.policy.check(req, this.adapters.payment.summary());
    if (v.verdict === 'deny') { this.log('payment', `审批结算复核未通过：${v.reason}（未扣款）`, { cause: req.cause }); if (req.desktop) this.desktop.onPayment(req.desktop, 'denied', { reason: v.reason }); return false; }
    try {
      const tx = await this.adapters.payment.pay(req);
      Object.assign(tx, { clock: this.world.clock?.(), day: this.world.day, approval: how, cause: req.cause });
      this.policy.record(req.amount);
      this.stats.spent = +(this.stats.spent + req.amount).toFixed(2);
      const dv = this.world.deliver?.(req.itemId);
      this.log('money', `支出 -$${req.amount}（${req.memo}，${how}，凭证 ${tx.ref}）`, { cause: req.cause });
      if (req.desktop) this.desktop.onPayment(req.desktop, 'paid', { tx: tx.ref });
      if (dv?.eat) this.doEat({ satiety: dv.eat }, req.cause);
      return true;
    } catch (e) { this.log('payment', `支付失败：${e.message}`, { cause: req.cause }); if (req.desktop) this.desktop.onPayment(req.desktop, 'denied', { reason: e.message }); return false; }
  }

  brief() {
    const p = this.adapters.payment; let b = 0;
    return {
      ...this.meta, running: this.running, paused: this.paused, takeover: this.takeover, tickMs: this.opts.tickMs,
      steps: this.stats.steps, stats: this.stats, balance: p.balance, energy: this.world?.energy, mood: this.world?.mood, hunger: this.world?.hunger, clock: this.world?.clock?.(), desktop: this.desktop?.target ? { name: this.desktop.target.name, kind: this.desktop.target.kind, goal: this.desktop.goal?.title, why: this.desktop.goal?.why, orders: this.desktop.os.orders.length, awaiting: this.desktop.os.orders.filter((o) => o.status === 'awaiting').length } : null,
      series: p.ledger.map((t) => +(b += t.amount).toFixed(2)), approvals: this.approvals.length, violations: this.violations.length,
      genome: this.dna.genome, policy: this.policy.summary(), life: this.lifeBrief(), snapshots: this.snapshots.map((s) => ({ step: s.step, clock: s.clock, balance: s.balance })),
      recent: this.timeline.slice(-60).map(({ id, seq, step, clock, kind, text, inherited, fork }) => ({ id, seq, step, clock, kind, text, inherited, fork })),
    };
  }

  snapshot() {
    return {
      meta: this.meta, dna: this.dna, persona: this.persona, identity: this.identity,
      adapters: Object.fromEntries(Object.entries(this.adapters || {}).map(([k, a]) => [k, a.summary()])),
      world: this.world?.screen(), worldKind: this.world?.kind,
      running: this.running, paused: this.paused, takeover: this.takeover, tickMs: this.opts.tickMs,
      timeline: this.timeline.slice(-200), memory: this.memory?.summary(this.society?.year), policy: this.policy?.summary(),
      life: this.society ? { ...this.society.summary({ hour: this.world?.minute !== undefined ? this.world.minute / 60 : 12, day: this.world?.day || 1 }), configRevision: this.configRevision || 0, canUndoConfig: !!this.configUndo } : null,
      approvals: this.approvals, stats: this.stats, violations: this.violations.slice(-20), trace: this.traceSummary(), desktop: this.desktop?.view(), hunger: this.world?.hunger,
      snapshots: this.snapshots.map((s) => ({ step: s.step, clock: s.clock, balance: s.balance })),
      llm: { enabled: llmEnabled(), model: llmConfig().model, baseUrl: llmConfig().baseUrl },
    };
  }
  traceSummary() {
    const t = (this.traces || []).slice(-60); if (!t.length) return null;
    const ms = t.map((x) => x.ms).sort((a, b) => a - b); const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
    const src = {}; for (const x of t) src[x.source] = (src[x.source] || 0) + 1;
    const ver = t.filter((x) => x.verify !== null);
    return { n: t.length, p50: q(0.5), p95: q(0.95), series: t.map((x) => x.ms), sources: src, verifyRate: ver.length ? Math.round(ver.filter((x) => x.verify).length / ver.length * 1000) / 10 : null, lawChecks: t.length * 18, violations: t.reduce((a, x) => a + x.violations, 0), events: t.reduce((a, x) => a + x.events, 0), recent: t.slice(-12).reverse() };
  }
  lifeBrief() {
    const s = this.society; if (!s) return null;
    const sm = s.summary({ hour: (this.world?.minute ?? 720) / 60, day: this.world?.day || 1 });
    return { year: sm.year, population: sm.population, maxGen: sm.maxGen, K: sm.civ.K, era: sm.civ.era, techs: sm.civ.unlocked.length, stability: sm.civ.stability, literacy: sm.civ.literacy, density: sm.civ.density, circulation: sm.social?.circulation, talks: sm.social?.talks, temp: sm.env.anomaly, ended: sm.ended,
      focus: sm.focus && { name: sm.focus.name, age: sm.focus.age, stage: sm.focus.stage, gen: sm.focus.gen, health: sm.focus.health, meaning: sm.focus.meaning }, deaths: sm.counters.deaths, births: sm.counters.births, causes: sm.causes, successions: sm.counters.successions, config: sm.config,
      series: { pop: sm.history.map((h) => h.pop), K: sm.history.map((h) => h.K), years: sm.history.map((h) => h.year) }, gini: sm.econ.gini, weather: sm.mirror.weather.kind };
  }
  emitState() { this.emit('state', this.snapshot()); }
}

function describe(a) {
  if (a.type === 'click') return a.target ? `点击 ${a.target}` : `点击 (${a.x}, ${a.y})`;
  if (a.type === 'type') return `输入「${String(a.text).slice(0, 40)}」`;
  if (a.type === 'key') return `按键 ${a.keys}`;
  if (a.type === 'rest') return '休息';
  if (a.type === 'move') return `移动鼠标到 (${a.x}, ${a.y})`;
  if (a.type === 'double_click') return `双击 (${a.x}, ${a.y})`;
  if (a.type === 'scroll') return `滚动 ${a.dy}`;
  if (a.type === 'wait') return `等待${a.reason ? '：' + a.reason : ''}`;
  if (a.type === 'request_payment') return `申请支付 $${a.amount}（${a.merchant}）`;
  if (a.type === 'done') return '报告完成';
  return a.type;
}

module.exports = { AgentEngine };
