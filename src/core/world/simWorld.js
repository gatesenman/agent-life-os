'use strict';
// 模拟世界：一台虚拟"桌面电脑"，含任务板/邮件/商店/钱包/日记 5 个应用。
// 每个可交互元素都有屏幕坐标（1280x800），使动作与真实 computer-use 一致（点击坐标 + 元素 id）。
const { createRng, wrapRng } = require('../prng');

const W = 1280, H = 800;
const SKILL_ZH = { writing: '写作', translation: '翻译', illustration: '插画', python: 'Python 编程', 'web-design': '网页设计', 'data-entry': '数据整理', 'video-script': '视频脚本', research: '资料调研' };
const APPS = ['jobs', 'mail', 'shop', 'wallet', 'notes'];
const APP_ZH = { jobs: '任务板', mail: '邮件', shop: '商店', wallet: '钱包', notes: '日记' };
const TASK_TEMPLATES = [
  { title: '为咖啡馆写 300 字介绍', skill: 'writing', reward: [4, 9], effort: [2, 3] },
  { title: '翻译一页产品说明（英→中）', skill: 'translation', reward: [5, 10], effort: [2, 4] },
  { title: '绘制一张社交媒体头像', skill: 'illustration', reward: [6, 14], effort: [3, 5] },
  { title: '写一个 CSV 清洗脚本', skill: 'python', reward: [8, 16], effort: [3, 5] },
  { title: '设计一个落地页草图', skill: 'web-design', reward: [7, 15], effort: [3, 5] },
  { title: '整理 200 条联系人数据', skill: 'data-entry', reward: [3, 6], effort: [1, 3] },
  { title: '写 60 秒短视频脚本', skill: 'video-script', reward: [5, 11], effort: [2, 3] },
  { title: '调研 5 款记账 App 并总结', skill: 'research', reward: [6, 12], effort: [2, 4] },
];
const SHOP = [
  { id: 'item-tablet', name: '数位板软件授权', price: 8, boosts: 'illustration', desc: '插画效率 +50%' },
  { id: 'item-course', name: '在线写作课', price: 6, boosts: 'writing', desc: '写作效率 +50%' },
  { id: 'item-ide', name: '专业版代码编辑器（月）', price: 5, boosts: 'python', desc: '编程效率 +50%' },
  { id: 'item-coffee', name: '虚拟咖啡', price: 1.5, boosts: null, energy: 30, desc: '能量 +30' },
  { id: 'item-meal', name: '外卖便当', price: 3, boosts: null, satiety: 0.6, desc: '饥饿 -60%' },
];

class SimWorld {
  constructor({ seed, skills = [], branchSeed = '', init = true }) {
    this.kind = 'sim';
    this.seed = seed; this.branchSeed = branchSeed; this.rngCalls = 0;
    const base = createRng(seed, 'world' + (branchSeed ? '::' + branchSeed : ''));
    // 计数包装：可在分叉时记录 RNG 消耗量，保证可复现
    this.rng = wrapRng(() => { this.rngCalls++; return base(); });
    this.skills = skills;
    this.minute = 8 * 60; // 第 1 天 08:00
    this.day = 1;
    this.openApp = 'jobs';
    this.cursor = { x: W / 2, y: H / 2 };
    this.tasks = [];
    this.current = null;
    this.mail = [{ id: 'm0', from: 'welcome@world.local', subject: '欢迎来到世界', body: '这是你的新电脑。接任务、赚钱、照顾好自己。花钱需要你的守护者批准。', read: false }];
    this.owned = [];
    this.mailSeq = 0;
    this.notes = [];
    this.energy = 100;
    this.hunger = 0.35; // 饥饿 ∈ [0,1]（L17 代谢律）：随世界时间上升，只有进食能降低
    this.mood = 0.6;
    this.lastClick = null;
    if (init) this.refreshTasks();
  }
  refreshTasks() {
    const r = this.rng;
    while (this.tasks.length < 4) {
      const pref = r.chance(0.6) ? TASK_TEMPLATES.filter((t) => this.skills.includes(t.skill)) : TASK_TEMPLATES;
      const t = r.pick(pref.length ? pref : TASK_TEMPLATES);
      this.tasks.push({ id: 't' + Math.floor(r() * 1e6).toString(36), title: t.title, skill: t.skill, reward: r.round(r.float(...t.reward)), effort: r.int(...t.effort), client: r.pick(['小鹿咖啡', '北岸工作室', '橙子科技', '青石书店', '星港物流']) });
    }
  }
  clock() { const h = Math.floor(this.minute / 60) % 24, m = this.minute % 60; return `第${this.day}天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  // 时间推进 + 熵：每流逝 60 分钟能量自然衰减 2 点（休息时除外）
  advance(mins, { resting = false } = {}) { if (!resting) this.energy = Math.max(0, this.energy - (mins / 60) * (this.hunger >= 0.85 ? 4 : 2)); this.hunger = Math.min(1, Math.round(((this.hunger ?? 0.35) + (mins / 60) * 0.05) * 1e4) / 1e4); if (this.hunger >= 1) this.mood = Math.max(0, this.mood - 0.01); this.minute += mins; while (this.minute >= 24 * 60) { this.minute -= 24 * 60; this.day++; } }

  // 屏幕元素（可访问性树）
  elements() {
    const els = APPS.map((a, i) => ({ id: `dock:${a}`, role: 'button', label: APP_ZH[a], rect: [40 + i * 110, 730, 96, 50] }));
    const body = (i, label, extra = {}) => ({ role: 'button', label, rect: [300, 150 + i * 90, 680, 74], ...extra });
    if (this.openApp === 'jobs') {
      this.tasks.forEach((t, i) => els.push(body(i, `${t.title}｜${t.client}｜$${t.reward}｜技能:${SKILL_ZH[t.skill]}｜需要 ${t.effort} 次工作`, { id: `task:${t.id}` })));
      if (this.current) els.push({ id: 'btn:work', role: 'button', label: `继续工作：${this.current.title}（${this.current.progress}/${this.current.effort}）`, rect: [300, 520, 330, 56] }, { id: 'btn:submit', role: 'button', label: '提交成果', rect: [650, 520, 330, 56] });
    } else if (this.openApp === 'mail') {
      this.mail.slice(-5).forEach((m, i) => els.push(body(i, `${m.read ? '' : '[未读] '}${m.subject} — ${m.from}`, { id: `mail:${m.id}` })));
    } else if (this.openApp === 'shop') {
      SHOP.forEach((s, i) => els.push(body(i, `${s.name} $${s.price}｜${s.desc}${s.boosts ? '｜加成:' + SKILL_ZH[s.boosts] : ''}${this.owned.includes(s.id) ? '｜已拥有' : ''}`, { id: `buy:${s.id}` })));
    } else if (this.openApp === 'notes') {
      els.push({ id: 'btn:diary', role: 'button', label: '写日记', rect: [300, 150, 300, 56] });
    }
    els.push({ id: 'btn:rest', role: 'button', label: '休息', rect: [1130, 52, 120, 36] });
    return els;
  }

  observe() {
    const els = this.elements();
    return {
      kind: 'sim', clock: this.clock(), openApp: this.openApp, energy: Math.round(this.energy), mood: this.mood, hunger: this.hunger,
      currentTask: this.current, elements: els.map(({ id, label }) => ({ id, label })),
      text: `时间 ${this.clock()}，当前应用「${APP_ZH[this.openApp]}」，能量 ${Math.round(this.energy)}，饥饿 ${Math.round(this.hunger * 100)}%。\n可交互元素：\n` + els.map((e) => `- ${e.id}: ${e.label}`).join('\n'),
    };
  }

  screen() {
    return {
      kind: 'sim', width: W, height: H, clock: this.clock(), openApp: this.openApp, appName: APP_ZH[this.openApp],
      cursor: this.cursor, lastClick: this.lastClick, energy: this.energy, mood: this.mood, hunger: this.hunger,
      elements: this.elements(), current: this.current, notes: this.notes.slice(-3), mail: this.mail.slice(-5),
    };
  }

  center(id) { const e = this.elements().find((x) => x.id === id); return e ? { x: e.rect[0] + e.rect[2] / 2, y: e.rect[1] + e.rect[3] / 2 } : null; }

  // action: { type:'click', target:'<element id>' } | { type:'type', text } | { type:'rest' }
  // 返回 { ok, message, earn?, payment? }
  act(action, ctx = {}) {
    this.advance(15);
    if (action.type === 'rest' || action.target === 'btn:rest') {
      this.advance(60, { resting: true }); this.energy = Math.min(100, this.energy + 35); this.mood = Math.min(1, this.mood + 0.05);
      return { ok: true, message: '休息了一小时，能量恢复。' };
    }
    if (action.type === 'type') {
      if (this.openApp !== 'notes') return { ok: false, message: '当前没有可输入的文本框。' };
      this.notes.push({ at: this.clock(), text: String(action.text || '').slice(0, 500) });
      return { ok: true, message: '日记已保存。', diary: action.text };
    }
    if (action.type !== 'click') return { ok: false, message: `未知动作 ${action.type}` };
    const id = action.target;
    const c = this.center(id);
    if (!c) return { ok: false, message: `屏幕上找不到元素 ${id}` };
    this.cursor = c; this.lastClick = { ...c, at: Date.now() };
    const [kind, arg] = id.split(':');
    if (kind === 'dock') { this.openApp = arg; return { ok: true, message: `打开了「${APP_ZH[arg]}」。` }; }
    if (kind === 'task') {
      if (this.current) return { ok: false, message: '手上已经有一个任务了，先完成它。' };
      const t = this.tasks.find((x) => x.id === arg);
      this.tasks = this.tasks.filter((x) => x.id !== arg);
      this.current = { ...t, progress: 0 };
      this.mail.push({ id: 'm' + (++this.mailSeq), from: `client@${t.client}.world`, subject: `任务确认：${t.title}`, body: `报酬 $${t.reward}，期待你的成果。`, read: false });
      return { ok: true, message: `接下任务「${t.title}」，报酬 $${t.reward}。` };
    }
    if (id === 'btn:work') {
      if (!this.current) return { ok: false, message: '没有进行中的任务。' };
      if (this.energy < 15) return { ok: false, message: '太累了，需要休息。' };
      const boosted = this.owned.some((o) => SHOP.find((s) => s.id === o)?.boosts === this.current.skill);
      const step = boosted ? 2 : 1;
      this.current.progress = Math.min(this.current.effort, this.current.progress + step);
      this.energy -= 12; this.advance(45);
      return { ok: true, message: `工作推进到 ${this.current.progress}/${this.current.effort}${boosted ? '（工具加成）' : ''}。` };
    }
    if (id === 'btn:submit') {
      const t = this.current;
      if (!t) return { ok: false, message: '没有可提交的任务。' };
      if (t.progress < t.effort) return { ok: false, message: '任务还没完成，客户不会接受。' };
      const skilled = this.skills.includes(t.skill);
      const quality = (skilled ? 0.75 : 0.45) + (ctx.conscientiousness || 0.5) * 0.25;
      const accepted = this.rng() < quality;
      this.current = null; this.refreshTasks();
      if (!accepted) { this.mood = Math.max(0, this.mood - 0.1); return { ok: true, message: `客户「${t.client}」要求返工并取消了订单。`, rejected: true }; }
      this.mood = Math.min(1, this.mood + 0.1);
      this.mail.push({ id: 'm' + (++this.mailSeq), from: `client@${t.client}.world`, subject: '付款通知', body: `已支付 $${t.reward}，谢谢！`, read: false });
      return { ok: true, message: `客户「${t.client}」验收通过，支付 $${t.reward}。`, earn: { amount: t.reward, memo: `${t.client}：${t.title}` } };
    }
    if (kind === 'mail') { const m = this.mail.find((x) => x.id === arg); if (m) m.read = true; return { ok: true, message: m ? `读邮件《${m.subject}》：${m.body}` : '邮件不存在' }; }
    if (kind === 'buy') {
      const item = SHOP.find((s) => s.id === arg);
      if (!item) return { ok: false, message: '商品不存在' };
      if (this.owned.includes(item.id) && !item.energy && !item.satiety) return { ok: false, message: '已经拥有该商品。' };
      return { ok: true, message: `请求购买「${item.name}」$${item.price}，等待支付。`, payment: { amount: item.price, merchant: 'World Shop', memo: item.name, itemId: item.id } };
    }
    if (id === 'btn:diary') return { ok: true, message: '打开了日记输入框，请输入文字（type 动作）。' };
    return { ok: false, message: '没有反应。' };
  }

  // 支付完成后由引擎回调
  deliver(itemId) {
    const item = SHOP.find((s) => s.id === itemId);
    if (!item) return;
    if (item.energy) this.energy = Math.min(100, this.energy + item.energy);
    else if (item.satiety) return { eat: item.satiety };
    else this.owned.push(item.id);
  }
  eat(satiety) { const before = this.hunger; this.hunger = Math.max(0, Math.round((this.hunger - satiety) * 1e4) / 1e4); this.mood = Math.min(1, this.mood + 0.05); this.ate = (this.ate || 0) + 1; return before; }
  tickLife() {}
  absMinutes() { return (this.day - 1) * 1440 + this.minute; }
  serialize() {
    const { rng, ...rest } = this;
    return JSON.parse(JSON.stringify(rest));
  }
  static restore(state, { branchSeed } = {}) {
    const w = new SimWorld({ seed: state.seed, skills: state.skills, branchSeed: branchSeed ?? state.branchSeed, init: false });
    const { seed, skills, branchSeed: _b, rngCalls, kind, ...rest } = state;
    Object.assign(w, JSON.parse(JSON.stringify(rest)));
    // 同一分支种子时快进 RNG 到相同位置，保证"从快照继续"与原世界一致
    if ((branchSeed ?? state.branchSeed) === state.branchSeed) for (let i = 0; i < rngCalls; i++) w.rng();
    return w;
  }
}

module.exports = { SimWorld, SHOP, APP_ZH };
