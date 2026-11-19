'use strict';
// 内置沙盒桌面（Sandbox OS）：一台完全离线、零配置的“虚拟电脑”。
// 关键约束（L18 人机边界）：智能体只能通过屏幕坐标级的键鼠动作操作它——
//   act({type:'move'|'click'|'double_click'|'type'|'key'|'scroll'|'wait', x, y, text, keys, dy})
// 沙盒按坐标做命中测试，再把命中元素的行为作用到自身状态；智能体拿不到任何内部接口。
// 屏幕由 layout() 产出“显示列表”（每个节点带像素矩形），观察者界面按同一份显示列表绘制，
// 因此观察者看到的画面与智能体“看到”的像素坐标完全一致。
const { createRng, wrapRng } = require('../prng');

const W = 1280, H = 800, TOP = 28;
const SITES = { 'waimai.sandbox': '速达外卖', 'shop.sandbox': '优选商城', 'jobs.sandbox': '灵活工作', 'mail.sandbox': '邮箱' };
const RESTAURANTS = [
  { id: 'r1', name: '巷口牛肉面', tag: '面食 · 小吃', rating: 4.8, eta: 28, hue: 18, icon: 'Soup', dishes: [
    { id: 'd11', name: '红烧牛肉面', price: 3.6, satiety: 0.62, main: true }, { id: 'd12', name: '酸辣粉', price: 2.4, satiety: 0.46, main: true }, { id: 'd13', name: '卤蛋', price: 0.6, satiety: 0.1 }] },
  { id: 'r2', name: '阿婆家常菜', tag: '家常 · 盖饭', rating: 4.7, eta: 32, hue: 38, icon: 'CookingPot', dishes: [
    { id: 'd21', name: '番茄炒蛋饭', price: 3.2, satiety: 0.6, main: true }, { id: 'd22', name: '青椒肉丝饭', price: 3.8, satiety: 0.66, main: true }, { id: 'd23', name: '紫菜蛋花汤', price: 0.9, satiety: 0.15 }] },
  { id: 'r3', name: '轻食沙拉研究所', tag: '轻食 · 健康', rating: 4.6, eta: 25, hue: 120, icon: 'Salad', dishes: [
    { id: 'd31', name: '鸡胸肉沙拉', price: 5.2, satiety: 0.5, main: true }, { id: 'd32', name: '牛油果卷', price: 4.6, satiety: 0.46, main: true }, { id: 'd33', name: '冷压果汁', price: 2.8, satiety: 0.12 }] },
  { id: 'r4', name: '深夜饺子馆', tag: '饺子 · 粥', rating: 4.9, eta: 30, hue: 210, icon: 'UtensilsCrossed', dishes: [
    { id: 'd41', name: '猪肉白菜水饺', price: 3.0, satiety: 0.6, main: true }, { id: 'd42', name: '三鲜水饺', price: 3.9, satiety: 0.62, main: true }, { id: 'd43', name: '小米粥', price: 1.0, satiety: 0.2 }] },
];
const DELIVERY_FEE = 0.8;
const PRODUCTS = [
  { id: 'p1', name: '数位板软件授权', price: 8, desc: '插画效率 +50%', icon: 'PenTool' },
  { id: 'p2', name: '在线写作课', price: 6, desc: '写作效率 +50%', icon: 'BookOpen' },
  { id: 'p3', name: '专业版代码编辑器（月）', price: 5, desc: '编程效率 +50%', icon: 'Code2' },
  { id: 'p4', name: '降噪耳机（虚拟）', price: 12, desc: '专注 +20%', icon: 'Headphones' },
];
const GIGS = [
  ['为咖啡馆写 300 字介绍', 'writing', [4, 9], 1], ['翻译一页产品说明（英译中）', 'translation', [5, 10], 2], ['绘制一张社交媒体头像', 'illustration', [6, 14], 2],
  ['写一个 CSV 清洗脚本', 'python', [8, 16], 3], ['设计一个落地页草图', 'web-design', [7, 15], 2], ['整理 200 条联系人数据', 'data-entry', [3, 6], 1],
  ['写 60 秒短视频脚本', 'video-script', [5, 11], 1], ['调研 5 款记账 App 并总结', 'research', [6, 12], 2],
];
const SKILL_ZH = { writing: '写作', translation: '翻译', illustration: '插画', python: 'Python', 'web-design': '网页设计', 'data-entry': '数据整理', 'video-script': '视频脚本', research: '资料调研' };
const r2 = (x) => Math.round(x * 100) / 100;
const money = (x) => `$${x.toFixed(2)}`;
const inside = (n, x, y) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h;

class SandboxOS {
  constructor({ seed = 'sandbox', branchSeed = '', skills = [], address = '住宅 D 栋', init = true } = {}) {
    this.kind = 'sandbox'; this.seed = seed; this.branchSeed = branchSeed; this.rngCalls = 0; this.skills = skills; this.address = address;
    const base = createRng(seed, 'desktop' + (branchSeed ? '::' + branchSeed : ''));
    this.rng = wrapRng(() => { this.rngCalls++; return base(); });
    this.cursor = { x: W / 2, y: H / 2 };
    this.windows = []; this.z = 0; this.focusInput = null; this.inputs = {};
    this.cart = []; this.orders = []; this.oseq = 0; this.gigs = []; this.gseq = 0; this.purchases = [];
    this.mail = [{ id: 'm1', from: 'system@sandbox.os', subject: '欢迎使用你的新电脑', body: '这是一台由守护者为你准备的沙盒电脑。点外卖、购物会动用你的钱包，每笔支付都需要守护者批准。', read: false }];
    this.mseq = 1; this.notesSaved = []; this.toast = null; this.now = 0; this.away = null;
    if (init) this.refreshGigs();
  }
  refreshGigs() {
    const r = this.rng;
    while (this.gigs.length < 4) {
      const pool = r() < 0.6 ? GIGS.filter((g) => this.skills.includes(g[1])) : GIGS; const g = r.pick(pool.length ? pool : GIGS);
      this.gigs.push({ id: 'g' + (++this.gseq), title: g[0], skill: g[1], reward: r.round(r.float(g[2][0], g[2][1])), effort: g[3], client: r.pick(['小鹿咖啡', '北岸工作室', '橙子科技', '青石书店', '星港物流']) });
    }
  }
  // ---------- 窗口管理 ----------
  win(id) { return this.windows.find((w) => w.id === id); }
  open(app, url) {
    let w = this.win(app);
    if (!w) {
      w = app === 'browser' ? { id: 'browser', app, title: '浏览器', x: 150, y: 46, w: 1000, h: 664, url: url || 'home', history: [], scroll: 0 }
        : { id: 'notes', app, title: '记事本', x: 720, y: 120, w: 460, h: 420 };
      this.windows.push(w);
    }
    w.min = false; w.z = ++this.z; if (url) this.nav(url);
    return w;
  }
  close(id) { this.windows = this.windows.filter((w) => w.id !== id); if (this.focusInput?.startsWith(id)) this.focusInput = null; }
  top() { return this.windows.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0] || null; }
  nav(url) {
    const b = this.win('browser'); if (!b) return;
    url = String(url).trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || 'home';
    if (b.url !== url) b.history.push(b.url);
    b.url = url; b.scroll = 0; this.inputs['browser:addr'] = url === 'home' ? '' : url; this.focusInput = null;
  }
  // ---------- 显示列表 ----------
  layout() {
    const N = [];
    const add = (n) => { N.push(n); return n; };
    // 桌面与顶栏
    add({ id: 'wall', k: 'wall', x: 0, y: 0, w: W, h: H });
    add({ id: 'topbar', k: 'rect', x: 0, y: 0, w: W, h: TOP, fill: 'rgba(16,18,24,0.72)' });
    add({ id: 'logo', k: 'icon', icon: 'Command', x: 14, y: 6, w: 16, h: 16, color: '#e8e9ec' });
    add({ id: 'osname', k: 'text', x: 38, y: 5, w: 120, h: 18, label: 'Sandbox OS', size: 12.5, weight: 600, color: '#e8e9ec' });
    const top = this.top();
    add({ id: 'appname', k: 'text', x: 140, y: 5, w: 200, h: 18, label: top ? top.title : '桌面', size: 12.5, color: '#c7c9d1' });
    add({ id: 'clock', k: 'text', x: W - 220, y: 5, w: 206, h: 18, label: this.clockText || '', size: 12.5, color: '#e8e9ec', align: 'right' });
    add({ id: 'wifi', k: 'icon', icon: 'Wifi', x: W - 270, y: 6, w: 16, h: 16, color: '#e8e9ec' });
    add({ id: 'batt', k: 'icon', icon: 'BatteryMedium', x: W - 246, y: 6, w: 18, h: 16, color: '#e8e9ec' });
    const ICONS = [['browser', '浏览器', 'Globe', 'open:browser'], ['waimai', '速达外卖', 'Bike', 'open:browser:waimai.sandbox'], ['jobs', '灵活工作', 'Briefcase', 'open:browser:jobs.sandbox'], ['mail', '邮箱', 'Mail', 'open:browser:mail.sandbox'], ['notes', '记事本', 'NotebookPen', 'open:notes']];
    ICONS.forEach(([id, label, icon, act], i) => add({ id: 'desk:' + id, k: 'deskicon', x: 26, y: 52 + i * 96, w: 76, h: 84, label, icon, act }));
    // 窗口（按 z 序绘制）
    for (const w of this.windows.filter((x) => !x.min).sort((a, b) => a.z - b.z)) {
      const focused = w === top;
      add({ id: w.id + ':frame', k: 'window', x: w.x, y: w.y, w: w.w, h: w.h, focused, act: 'focus:' + w.id, win: w.id, wz: w.z });
      add({ win: w.id, wz: w.z, id: w.id + ':close', k: 'dot', x: w.x + 14, y: w.y + 12, w: 12, h: 12, fill: '#ff5f57', label: '关闭', act: 'close:' + w.id });
      add({ win: w.id, wz: w.z, id: w.id + ':min', k: 'dot', x: w.x + 32, y: w.y + 12, w: 12, h: 12, fill: '#febc2e', label: '最小化', act: 'min:' + w.id });
      add({ id: w.id + ':zoom', k: 'dot', x: w.x + 50, y: w.y + 12, w: 12, h: 12, fill: '#28c840' });
      const addW = (n) => add({ ...n, win: w.id, wz: w.z });
      addW({ id: w.id + ':bar', k: 'none', x: w.x, y: w.y, w: w.w, h: 0 });
      if (w.app === 'browser') this.browser(w, addW); else this.notes(w, addW);
    }
    // 程序坞
    const dock = [['browser', '浏览器', 'Globe', 'open:browser'], ['waimai', '速达外卖', 'Bike', 'open:browser:waimai.sandbox'], ['jobs', '灵活工作', 'Briefcase', 'open:browser:jobs.sandbox'], ['mail', '邮箱', 'Mail', 'open:browser:mail.sandbox'], ['notes', '记事本', 'NotebookPen', 'open:notes']];
    const dw = dock.length * 62 + 16; const dx = (W - dw) / 2;
    add({ id: 'dock', k: 'dock', x: dx, y: H - 70, w: dw, h: 62 });
    dock.forEach(([id, label, icon, act], i) => add({ id: 'dock:' + id, k: 'dockicon', x: dx + 12 + i * 62, y: H - 63, w: 50, h: 50, label, icon, act, running: !!this.win(id === 'notes' ? 'notes' : 'browser') && (id === 'browser' || id === 'notes') }));
    if (this.toast) add({ id: 'toast', k: 'toast', x: W - 340, y: 40, w: 320, h: 64, label: this.toast.title, sub: this.toast.body, icon: this.toast.icon || 'Bell' });
    if (this.away) add({ id: 'away', k: 'away', x: 0, y: 0, w: W, h: H, label: this.away });
    return N;
  }
  browser(w, add) {
    const url = w.url;
    add({ id: 'browser:tab', k: 'tab', x: w.x + 80, y: w.y + 6, w: 220, h: 28, label: url === 'home' ? '新标签页' : SITES[url.split('/')[0]] || url, icon: 'Globe' });
    add({ id: 'browser:back', k: 'btn', variant: 'icon', icon: 'ArrowLeft', x: w.x + 12, y: w.y + 44, w: 30, h: 28, label: '后退', act: 'back' });
    add({ id: 'browser:reload', k: 'btn', variant: 'icon', icon: 'RotateCw', x: w.x + 46, y: w.y + 44, w: 30, h: 28, label: '刷新', act: 'reload' });
    add({ id: 'browser:addr', k: 'input', x: w.x + 84, y: w.y + 44, w: w.w - 100, h: 28, inputId: 'browser:addr', value: this.inputs['browser:addr'] ?? '', placeholder: '输入网址，例如 waimai.sandbox', icon: 'Lock', role: 'address' });
    const cx = w.x, cy = w.y + 80, cw = w.w, ch = w.h - 80;
    add({ id: 'browser:page', k: 'page', x: cx, y: cy, w: cw, h: ch });
    const items = [];
    const P = (n) => items.push(n);
    const [host, ...rest] = url.split('/'); const path = rest.join('/');
    if (url === 'home') {
      P({ id: 'home:title', k: 'text', x: 0, y: 70, w: cw, h: 30, label: '常用网站', size: 20, weight: 600, align: 'center', color: '#1d1f24' });
      Object.entries(SITES).forEach(([h, name], i) => P({ id: 'home:' + h, k: 'tile', x: cw / 2 - 270 + i * 140, y: 130, w: 120, h: 110, label: name, sub: h, icon: { 'waimai.sandbox': 'Bike', 'shop.sandbox': 'ShoppingBag', 'jobs.sandbox': 'Briefcase', 'mail.sandbox': 'Mail' }[h], act: 'nav:' + h }));
    } else if (host === 'waimai.sandbox') this.pageWaimai(path, cw, ch, P);
    else if (host === 'shop.sandbox') this.pageShop(path, cw, P);
    else if (host === 'jobs.sandbox') this.pageJobs(path, cw, P);
    else if (host === 'mail.sandbox') this.pageMail(path, cw, P);
    else P({ id: 'err', k: 'text', x: 0, y: 160, w: cw, h: 30, label: `无法访问 ${url}（沙盒内只有 4 个网站）`, align: 'center', size: 15, color: '#6b7080' });
    // 滚动与裁剪：只保留内容区内可见的节点（固定节点 fixed 不随滚动）
    const maxY = Math.max(0, ...items.map((n) => n.y + n.h)) - ch + 20; w.maxScroll = Math.max(0, maxY);
    if (w.scroll > w.maxScroll) w.scroll = w.maxScroll;
    for (const n of items) {
      const y = n.fixed ? n.y : n.y - w.scroll; if (y + n.h < 0 || y > ch) continue;
      const m = { ...n, x: cx + n.x, y: cy + y }; if (m.y < cy) { if (m.k !== 'rect' && m.k !== 'text') continue; }
      add(m);
    }
  }
  pageWaimai(path, cw, ch, P) {
    P({ id: 'wm:hero', k: 'rect', x: 0, y: 0, w: cw, h: 96, fill: 'linear-gradient(120deg,#ffb347,#ff7a59)' });
    P({ id: 'wm:brand', k: 'text', x: 32, y: 24, w: 300, h: 30, label: '速达外卖', size: 24, weight: 700, color: '#fff' });
    P({ id: 'wm:addr', k: 'text', x: 32, y: 58, w: 600, h: 20, label: `送至：镜像世界 · ${this.address}`, size: 13, color: 'rgba(255,255,255,0.92)', icon: 'MapPin' });
    const [page, arg] = path.split('/');
    if (!page) {
      P({ id: 'wm:search', k: 'input', x: cw - 360, y: 30, w: 320, h: 36, inputId: 'wm:search', value: this.inputs['wm:search'] || '', placeholder: '搜索餐厅或菜品', icon: 'Search' });
      const q = (this.inputs['wm:search'] || '').trim();
      const list = RESTAURANTS.filter((r) => !q || r.name.includes(q) || r.dishes.some((d) => d.name.includes(q)));
      P({ id: 'wm:h', k: 'text', x: 32, y: 116, w: 400, h: 24, label: q ? `“${q}”的搜索结果` : '附近好店', size: 16, weight: 600, color: '#1d1f24' });
      list.forEach((r, i) => P({ id: 'wm:r:' + r.id, k: 'card', x: 32 + (i % 2) * ((cw - 80) / 2 + 16), y: 152 + Math.floor(i / 2) * 132, w: (cw - 80) / 2, h: 116, label: r.name, sub: `${r.tag} · ${r.rating} 分 · 约 ${r.eta} 分钟 · 配送费 ${money(DELIVERY_FEE)}`, icon: r.icon, hue: r.hue, act: 'nav:waimai.sandbox/shop/' + r.id }));
      if (!list.length) P({ id: 'wm:none', k: 'text', x: 32, y: 160, w: 400, h: 20, label: '没有找到相关餐厅', color: '#6b7080' });
      return;
    }
    if (page === 'shop') {
      const r = RESTAURANTS.find((x) => x.id === arg); if (!r) return;
      P({ id: 'wm:shopname', k: 'text', x: 32, y: 116, w: 500, h: 28, label: r.name, size: 20, weight: 700, color: '#1d1f24' });
      P({ id: 'wm:shopsub', k: 'text', x: 32, y: 148, w: 600, h: 20, label: `${r.tag} · ${r.rating} 分 · 约 ${r.eta} 分钟送达`, size: 13, color: '#6b7080' });
      r.dishes.forEach((d, i) => {
        const y = 186 + i * 92; const inCart = this.cart.filter((c) => c.dish === d.id).length;
        P({ id: 'wm:dish:' + d.id, k: 'dish', x: 32, y, w: cw - 64, h: 78, label: d.name, sub: `${d.main ? '主食' : '小份'} · 饱腹 ${Math.round(d.satiety * 100)}`, price: money(d.price), hue: r.hue, icon: r.icon, count: inCart });
        P({ id: 'wm:add:' + d.id, k: 'btn', variant: 'round', icon: 'Plus', x: cw - 92, y: y + 22, w: 34, h: 34, label: `加入购物车：${d.name}`, act: `add:${r.id}:${d.id}` });
        if (inCart) P({ id: 'wm:sub:' + d.id, k: 'btn', variant: 'roundghost', icon: 'Minus', x: cw - 172, y: y + 22, w: 34, h: 34, label: `减少：${d.name}`, act: `sub:${d.id}` });
      });
      this.cartBar(cw, ch, P);
      return;
    }
    if (page === 'checkout') {
      const items = this.cartItems(); const total = this.cartTotal();
      P({ id: 'wm:co', k: 'text', x: 32, y: 116, w: 400, h: 28, label: '确认订单', size: 20, weight: 700, color: '#1d1f24' });
      P({ id: 'wm:coaddr', k: 'row', x: 32, y: 156, w: cw - 64, h: 52, label: `收货地址：镜像世界 · ${this.address}`, sub: '虚拟地址，仅在沙盒内有效', icon: 'MapPin' });
      items.forEach((it, i) => P({ id: 'wm:coi:' + it.dish.id, k: 'row', x: 32, y: 220 + i * 46, w: cw - 64, h: 40, label: `${it.dish.name} × ${it.n}`, right: money(it.dish.price * it.n) }));
      const y = 228 + items.length * 46;
      P({ id: 'wm:fee', k: 'row', x: 32, y, w: cw - 64, h: 40, label: '配送费', right: money(DELIVERY_FEE) });
      P({ id: 'wm:total', k: 'row', x: 32, y: y + 46, w: cw - 64, h: 44, label: '合计', right: money(total), strong: true });
      P({ id: 'wm:note', k: 'text', x: 32, y: y + 104, w: cw - 64, h: 20, label: '支付将由你的智能体钱包发起，必须经过预算策略与守护者批准。', size: 12.5, color: '#6b7080', icon: 'ShieldCheck' });
      P({ id: 'wm:submit', k: 'btn', variant: 'primary', x: cw - 252, y: y + 140, w: 220, h: 44, label: `提交订单并支付 ${money(total)}`, act: 'submit', disabled: !items.length });
      return;
    }
    if (page === 'order') {
      const o = this.orders.find((x) => x.id === arg); if (!o) return;
      const ST = { awaiting: ['等待守护者批准支付', 'Hourglass', '订单已提交，支付请求已发送到观察舱，批准后才会扣款。'], paid: ['骑手已接单，配送中', 'Bike', `预计 ${o.eta} 分钟送达（世界时间）。`], delivered: ['已送达', 'PackageCheck', '外卖已放在门口，请确认收货。'], eaten: ['已确认收货', 'CheckCircle2', '用餐完成，饥饿感下降。'], cancelled: ['支付被拒绝，订单已取消', 'XCircle', '守护者没有批准这笔支出，未扣款。'], denied: ['支付被预算策略拒绝', 'XCircle', o.reason || ''] };
      const [t, icon, sub] = ST[o.status];
      P({ id: 'wm:ost', k: 'status', x: 32, y: 120, w: cw - 64, h: 120, label: t, sub, icon, tone: { awaiting: 'warn', paid: 'info', delivered: 'ok', eaten: 'ok', cancelled: 'bad', denied: 'bad' }[o.status] });
      o.items.forEach((it, i) => P({ id: 'wm:oi:' + i, k: 'row', x: 32, y: 256 + i * 44, w: cw - 64, h: 38, label: `${it.name} × ${it.n}`, right: money(it.price * it.n) }));
      const y = 264 + o.items.length * 44;
      P({ id: 'wm:ot', k: 'row', x: 32, y, w: cw - 64, h: 40, label: `订单号 ${o.id} · 合计`, right: money(o.total), strong: true });
      if (o.status === 'delivered') P({ id: 'wm:recv', k: 'btn', variant: 'primary', x: cw - 232, y: y + 60, w: 200, h: 44, label: '确认收货', act: 'receive:' + o.id });
      if (['eaten', 'cancelled', 'denied'].includes(o.status)) P({ id: 'wm:again', k: 'btn', x: cw - 232, y: y + 60, w: 200, h: 44, label: '返回首页', act: 'nav:waimai.sandbox' });
    }
  }
  cartBar(cw, ch, P) {
    const n = this.cart.length; if (!n) return;
    P({ id: 'wm:cart', k: 'cartbar', x: 24, y: ch - 76, w: cw - 48, h: 60, label: `购物车 ${n} 件`, sub: `合计 ${money(this.cartTotal())}（含配送费）`, fixed: true });
    P({ id: 'wm:checkout', k: 'btn', variant: 'primary', x: cw - 204, y: ch - 66, w: 164, h: 40, label: '去结算', act: 'nav:waimai.sandbox/checkout', fixed: true });
  }
  cartItems() { const m = new Map(); for (const c of this.cart) { const r = RESTAURANTS.find((x) => x.id === c.shop); const d = r.dishes.find((x) => x.id === c.dish); const e = m.get(d.id) || { dish: d, shop: r, n: 0 }; e.n++; m.set(d.id, e); } return [...m.values()]; }
  cartTotal() { return this.cart.length ? r2(this.cartItems().reduce((s, it) => s + it.dish.price * it.n, 0) + DELIVERY_FEE) : 0; }
  pageShop(path, cw, P) {
    P({ id: 'sh:brand', k: 'text', x: 32, y: 26, w: 400, h: 30, label: '优选商城', size: 22, weight: 700, color: '#1d1f24' });
    PRODUCTS.forEach((p, i) => {
      const owned = this.purchases.some((x) => x.product === p.id && x.status === 'paid');
      P({ id: 'sh:p:' + p.id, k: 'product', x: 32 + i * ((cw - 64) / 4), y: 80, w: (cw - 64) / 4 - 16, h: 220, label: p.name, sub: p.desc, price: money(p.price), icon: p.icon });
      P({ id: 'sh:buy:' + p.id, k: 'btn', variant: owned ? 'ghost' : 'primary', x: 48 + i * ((cw - 64) / 4), y: 252, w: (cw - 64) / 4 - 48, h: 34, label: owned ? '已拥有' : '购买', act: owned ? null : 'buy:' + p.id });
    });
  }
  pageJobs(path, cw, P) {
    P({ id: 'jb:brand', k: 'text', x: 32, y: 26, w: 400, h: 30, label: '灵活工作', size: 22, weight: 700, color: '#1d1f24' });
    P({ id: 'jb:sub', k: 'text', x: 32, y: 60, w: 600, h: 20, label: '面向 AI 自由职业者的合规零工平台。所有成果需标注由 AI 完成。', size: 13, color: '#6b7080' });
    const [page, arg] = path.split('/');
    if (!page) {
      this.gigs.forEach((g, i) => P({ id: 'jb:g:' + g.id, k: 'job', x: 32, y: 100 + i * 96, w: cw - 64, h: 84, label: g.title, sub: `${g.client} · 技能：${SKILL_ZH[g.skill]} · 工时约 ${g.effort * 40} 分钟`, price: money(g.reward), act: 'nav:jobs.sandbox/gig/' + g.id }));
      return;
    }
    const g = this.gigs.find((x) => x.id === arg) || this.doneGig;
    if (!g) return;
    P({ id: 'jb:title', k: 'text', x: 32, y: 100, w: cw - 64, h: 28, label: g.title, size: 19, weight: 700, color: '#1d1f24' });
    P({ id: 'jb:meta', k: 'text', x: 32, y: 132, w: cw - 64, h: 20, label: `${g.client} · 报酬 ${money(g.reward)} · 技能：${SKILL_ZH[g.skill]}`, size: 13, color: '#6b7080' });
    if (g.result) { P({ id: 'jb:res', k: 'status', x: 32, y: 170, w: cw - 64, h: 110, label: g.result.ok ? '客户已验收并付款' : '客户要求返工', sub: g.result.msg, icon: g.result.ok ? 'BadgeCheck' : 'RotateCcw', tone: g.result.ok ? 'ok' : 'bad' }); P({ id: 'jb:back', k: 'btn', x: cw - 232, y: 300, w: 200, h: 40, label: '返回任务列表', act: 'nav:jobs.sandbox' }); return; }
    P({ id: 'jb:ta', k: 'textarea', x: 32, y: 168, w: cw - 64, h: 200, inputId: 'jb:ta:' + g.id, value: this.inputs['jb:ta:' + g.id] || '', placeholder: '在这里写下交付内容（至少 20 个字）' });
    P({ id: 'jb:submit', k: 'btn', variant: 'primary', x: cw - 232, y: 388, w: 200, h: 44, label: '提交成果', act: 'deliver:' + g.id });
  }
  pageMail(path, cw, P) {
    P({ id: 'ml:brand', k: 'text', x: 32, y: 26, w: 400, h: 30, label: '邮箱', size: 22, weight: 700, color: '#1d1f24' });
    const [page, arg] = path.split('/');
    if (page === 'm') { const m = this.mail.find((x) => x.id === arg); if (!m) return; P({ id: 'ml:subj', k: 'text', x: 32, y: 80, w: cw - 64, h: 26, label: m.subject, size: 18, weight: 600, color: '#1d1f24' }); P({ id: 'ml:from', k: 'text', x: 32, y: 110, w: cw - 64, h: 20, label: m.from, size: 12.5, color: '#6b7080' }); P({ id: 'ml:body', k: 'para', x: 32, y: 146, w: cw - 64, h: 120, label: m.body }); P({ id: 'ml:back', k: 'btn', x: 32, y: 280, w: 120, h: 36, label: '返回收件箱', act: 'nav:mail.sandbox' }); return; }
    this.mail.slice(-7).reverse().forEach((m, i) => P({ id: 'ml:m:' + m.id, k: 'mailrow', x: 32, y: 76 + i * 64, w: cw - 64, h: 56, label: m.subject, sub: m.from, unread: !m.read, act: 'nav:mail.sandbox/m/' + m.id }));
  }
  notes(w, add) {
    add({ id: 'notes:title', k: 'text', x: w.x + 76, y: w.y + 9, w: 200, h: 18, label: '记事本', size: 12.5, weight: 600, color: '#3b3f4a' });
    add({ id: 'notes:ta', k: 'textarea', x: w.x + 16, y: w.y + 44, w: w.w - 32, h: w.h - 116, inputId: 'notes:ta', value: this.inputs['notes:ta'] || '', placeholder: '写点什么……' });
    add({ id: 'notes:save', k: 'btn', variant: 'primary', x: w.x + w.w - 136, y: w.y + w.h - 58, w: 120, h: 38, label: '保存日记', act: 'save-note' });
    if (this.notesSaved.length) add({ id: 'notes:last', k: 'text', x: w.x + 16, y: w.y + w.h - 50, w: w.w - 170, h: 20, label: `已保存 ${this.notesSaved.length} 篇 · 最近：${this.notesSaved[this.notesSaved.length - 1].at}`, size: 12, color: '#6b7080' });
  }
  // ---------- 观察（智能体与观察者共用） ----------
  screen() { return { kind: 'sandbox', width: W, height: H, nodes: this.layout(), cursor: this.cursor, focusInput: this.focusInput }; }
  // 屏幕解析：相当于对截图做 OCR + 控件识别，返回可见文本与可交互控件的像素矩形（无内部 id 语义）
  parse() {
    const nodes = this.layout(); const b = this.win('browser'); const top = this.top();
    const frames = nodes.filter((n) => n.k === 'window');
    // 遮挡：控件中心被更高层窗口盖住时，屏幕上看不到它
    const occluded = (n) => { const cx = n.x + n.w / 2, cy = n.y + n.h / 2; return frames.some((f) => (n.win ? f.wz > n.wz : true) && f.win !== n.win && inside(f, cx, cy)); };
    const els = nodes.filter((n) => n.k !== 'window' && !occluded(n)).filter((n) => n.act || n.inputId || ['text', 'status', 'row', 'cartbar', 'card', 'dish', 'job', 'product', 'mailrow', 'tile', 'para', 'toast', 'away'].includes(n.k))
      .map((n) => ({ role: n.inputId ? (n.k === 'textarea' ? 'textarea' : 'textbox') : n.act ? 'button' : 'text', label: [n.label || n.placeholder, n.sub, n.price, n.right].filter(Boolean).join(' · '), value: n.inputId ? n.value : undefined, focused: n.inputId ? this.focusInput === n.inputId : undefined, x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h), enabled: n.disabled ? false : undefined }));
    return { width: W, height: H, topWindow: top?.title || '桌面', address: b && !b.min ? this.inputs['browser:addr'] : null, page: b && !b.min ? b.url : null, browserOpen: !!(b && !b.min), notesOpen: !!(this.win('notes') && !this.win('notes').min), elements: els };
  }
  // ---------- 动作（仅坐标级键鼠） ----------
  act(a) {
    const t = a.type; this.toastAge = (this.toastAge || 0) + 1; if (this.toastAge > 4) this.toast = null;
    if (t === 'move') { this.cursor = { x: clampX(a.x), y: clampY(a.y) }; return { ok: true, message: `鼠标移动到 (${Math.round(a.x)}, ${Math.round(a.y)})`, minutes: 0.2 }; }
    if (t === 'wait') return { ok: true, message: a.reason || '等待', minutes: a.minutes || 5 };
    if (t === 'scroll') {
      const n = this.hit(this.cursor.x, this.cursor.y); const w = n && this.windows.find((x) => n.id.startsWith(x.id + ':')) || this.top();
      if (!w || w.app !== 'browser') return { ok: false, message: '这里不能滚动', minutes: 0.2 };
      w.scroll = Math.max(0, Math.min(w.maxScroll || 0, (w.scroll || 0) + (a.dy || 300))); return { ok: true, message: `滚动 ${a.dy > 0 ? '向下' : '向上'}`, minutes: 0.3 };
    }
    if (t === 'type') {
      if (!this.focusInput) return { ok: false, message: '没有获得焦点的输入框，文字没有输入到任何地方', minutes: 0.5 };
      const s = String(a.text || ''); this.inputs[this.focusInput] = (this.inputs[this.focusInput] || '') + s;
      return { ok: true, message: `输入了 ${[...s].length} 个字符`, minutes: Math.max(0.5, [...s].length / 40) };
    }
    if (t === 'key') return this.key(String(a.keys || ''));
    if (t === 'click' || t === 'double_click') {
      this.cursor = { x: clampX(a.x), y: clampY(a.y) };
      const n = this.hit(this.cursor.x, this.cursor.y);
      if (!n) { this.focusInput = null; return { ok: true, message: '点击了空白处', minutes: 0.3 }; }
      if (n.inputId) { this.focusInput = n.inputId; return { ok: true, message: `聚焦输入框「${n.placeholder || n.label || n.inputId}」`, minutes: 0.3 }; }
      if (n.disabled) return { ok: false, message: '按钮不可用', minutes: 0.3 };
      this.focusInput = null;
      return { minutes: 0.5, ...this.run(n.act, n) };
    }
    return { ok: false, message: `沙盒不支持动作 ${t}`, minutes: 0.2 };
  }
  hit(x, y) {
    const ns = this.layout();
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (n.k === 'away' && inside(n, x, y)) return null;
      if ((n.act || n.inputId) && n.k !== 'window' && inside(n, x, y)) { const w = n.win && this.win(n.win); if (w) w.z = ++this.z; return n; }
      if (n.k === 'window' && inside(n, x, y)) { const w = this.win(n.win); if (w) w.z = ++this.z; return { ...n, act: 'focus:' + n.win, label: w.title }; } // 窗口空白处：只聚焦该窗口，不会穿透到下层
    }
    return null;
  }
  key(keys) {
    const k = keys.toLowerCase();
    if (k === 'enter' || k === 'return') {
      if (this.focusInput === 'browser:addr') { const v = this.inputs['browser:addr'] || ''; this.nav(v); return { ok: true, message: `打开 ${v}`, minutes: 0.5 }; }
      if (this.focusInput === 'wm:search') return { ok: true, message: `搜索「${this.inputs['wm:search'] || ''}」`, minutes: 0.4 };
      return { ok: true, message: '回车', minutes: 0.2 };
    }
    if (k === 'backspace') { if (this.focusInput) this.inputs[this.focusInput] = [...(this.inputs[this.focusInput] || '')].slice(0, -1).join(''); return { ok: true, message: '退格', minutes: 0.1 }; }
    if (k === 'ctrl+a') { this.selectAll = this.focusInput; return { ok: true, message: '全选', minutes: 0.1 }; }
    if (k === 'delete' || (k === 'ctrl+a+backspace')) { if (this.focusInput) this.inputs[this.focusInput] = ''; return { ok: true, message: '清空输入框', minutes: 0.1 }; }
    if (k === 'ctrl+l') { const b = this.win('browser'); if (!b) return { ok: false, message: '浏览器没有打开', minutes: 0.1 }; this.focusInput = 'browser:addr'; this.inputs['browser:addr'] = ''; return { ok: true, message: '聚焦地址栏', minutes: 0.1 }; }
    if (k === 'escape') { this.focusInput = null; return { ok: true, message: 'Esc', minutes: 0.1 }; }
    return { ok: true, message: `按键 ${keys}（无效果）`, minutes: 0.1 };
  }
  run(act, n) {
    if (!act) return { ok: false, message: '没有反应' };
    const [op, a1, a2] = act.split(':');
    if (op === 'open') { if (a1 === 'browser') this.open('browser', a2 ? act.slice('open:browser:'.length) : undefined); else this.open('notes'); return { ok: true, message: `打开「${n.label}」` }; }
    if (op === 'focus') { const w = this.win(a1); if (w) w.z = ++this.z; return { ok: true, message: `切换到「${w?.title}」窗口` }; }
    if (op === 'close') { this.close(a1); return { ok: true, message: '关闭窗口' }; }
    if (op === 'min') { const w = this.win(a1); if (w) w.min = true; return { ok: true, message: '最小化窗口' }; }
    if (op === 'back') { const b = this.win('browser'); const u = b.history.pop(); if (u) { b.url = u; b.scroll = 0; this.inputs['browser:addr'] = u === 'home' ? '' : u; } return { ok: true, message: '后退' }; }
    if (op === 'reload') return { ok: true, message: '刷新页面' };
    if (op === 'nav') { this.nav(act.slice(4)); return { ok: true, message: `打开 ${act.slice(4)}` }; }
    if (op === 'add') { if (this.cart.length && this.cart[0].shop !== a1) this.cart = []; this.cart.push({ shop: a1, dish: a2 }); return { ok: true, message: `加入购物车：${n.label.replace('加入购物车：', '')}` }; }
    if (op === 'sub') { const i = this.cart.map((c) => c.dish).lastIndexOf(a1); if (i >= 0) this.cart.splice(i, 1); return { ok: true, message: '减少一份' }; }
    if (op === 'submit') {
      const items = this.cartItems(); if (!items.length) return { ok: false, message: '购物车是空的' };
      const o = { id: 'WM' + String(++this.oseq).padStart(4, '0'), shop: items[0].shop.name, items: items.map((it) => ({ name: it.dish.name, price: it.dish.price, n: it.n, satiety: it.dish.satiety })), total: this.cartTotal(), eta: items[0].shop.eta, status: 'awaiting', at: this.now };
      o.satiety = Math.min(0.95, o.items.reduce((s, it) => s + it.satiety * it.n, 0));
      this.orders.push(o); this.cart = []; this.nav('waimai.sandbox/order/' + o.id);
      return { ok: true, message: `提交订单 ${o.id}（${o.shop}，${money(o.total)}），发起支付请求`, payment: { amount: o.total, merchant: '速达外卖', memo: `外卖订单 ${o.id}：${o.items.map((i) => i.name).join('、')}`, desktop: { kind: 'order', id: o.id } } };
    }
    if (op === 'receive') { const o = this.orders.find((x) => x.id === a1); if (!o || o.status !== 'delivered') return { ok: false, message: '订单还没有送达' }; o.status = 'eaten'; return { ok: true, message: `确认收货并用餐：${o.items.map((i) => i.name).join('、')}`, eat: { satiety: o.satiety, order: o.id } }; }
    if (op === 'buy') {
      const p = PRODUCTS.find((x) => x.id === a1); const pu = { id: 'SP' + String(this.purchases.length + 1).padStart(3, '0'), product: p.id, name: p.name, total: p.price, status: 'awaiting' };
      this.purchases.push(pu); this.toast = { title: '支付请求已发出', body: `${p.name} ${money(p.price)}，等待守护者批准`, icon: 'Hourglass' }; this.toastAge = 0;
      return { ok: true, message: `请求购买「${p.name}」${money(p.price)}`, payment: { amount: p.price, merchant: '优选商城', memo: `商城订单 ${pu.id}：${p.name}`, desktop: { kind: 'purchase', id: pu.id } } };
    }
    if (op === 'deliver') {
      const g = this.gigs.find((x) => x.id === a1); if (!g) return { ok: false, message: '任务不存在' };
      const txt = this.inputs['jb:ta:' + g.id] || '';
      if ([...txt].length < 20) return { ok: false, message: '交付内容太短（至少 20 个字），客户不会接受' };
      const skilled = this.skills.includes(g.skill); const ok = this.rng() < (skilled ? 0.85 : 0.6) + Math.min(0.1, [...txt].length / 2000);
      g.result = { ok, msg: ok ? `${g.client} 已支付 ${money(g.reward)}，感谢你的交付。` : `${g.client} 认为内容不够具体，取消了订单。` };
      this.doneGig = g; this.gigs = this.gigs.filter((x) => x.id !== g.id); delete this.inputs['jb:ta:' + g.id]; this.refreshGigs();
      if (ok) this.pushMail(`client@${g.client}.world`, `付款通知：${g.title}`, `已支付 ${money(g.reward)}，谢谢！`);
      return { ok: true, message: ok ? `客户「${g.client}」验收通过，支付 ${money(g.reward)}` : `客户「${g.client}」要求返工`, minutes: g.effort * 40, work: g.effort, ...(ok ? { earn: { amount: g.reward, memo: `${g.client}：${g.title}（沙盒零工）` } } : { rejected: true }) };
    }
    if (op === 'save-note') { const t = (this.inputs['notes:ta'] || '').trim(); if (!t) return { ok: false, message: '日记是空的' }; this.notesSaved.push({ at: this.clockText, text: t }); this.inputs['notes:ta'] = ''; return { ok: true, message: '日记已保存', diary: t }; }
    return { ok: false, message: '没有反应' };
  }
  pushMail(from, subject, body) { this.mail.push({ id: 'm' + (++this.mseq), from, subject, body, read: false }); }
  // ---------- 外部事件（钱包、时间） ----------
  onPayment(ref, outcome, info = {}) {
    if (ref.kind === 'order') {
      const o = this.orders.find((x) => x.id === ref.id); if (!o) return;
      if (outcome === 'paid') { o.status = 'paid'; o.paidAt = this.now; o.tx = info.tx; this.pushMail('order@waimai.sandbox', `订单 ${o.id} 支付成功`, `骑手已接单，预计 ${o.eta} 分钟送达。`); this.toast = { title: '支付成功', body: `订单 ${o.id} 骑手已接单`, icon: 'Bike' }; }
      else { o.status = outcome === 'denied' ? 'denied' : 'cancelled'; o.reason = info.reason; this.toast = { title: '订单已取消', body: outcome === 'denied' ? `预算策略拒绝：${info.reason}` : outcome === 'cancelled' ? '换了电脑，这笔待审批订单已作废' : '守护者拒绝了这笔支出', icon: 'XCircle' }; }
      this.toastAge = 0;
    } else if (ref.kind === 'purchase') {
      const p = this.purchases.find((x) => x.id === ref.id); if (!p) return;
      p.status = outcome === 'paid' ? 'paid' : 'cancelled'; p.tx = info.tx; this.toast = { title: outcome === 'paid' ? '购买成功' : '购买已取消', body: p.name, icon: outcome === 'paid' ? 'BadgeCheck' : 'XCircle' }; this.toastAge = 0;
    }
  }
  tick(nowMin, clockText) {
    this.now = nowMin; this.clockText = clockText;
    for (const o of this.orders) if (o.status === 'paid' && nowMin - o.paidAt >= o.eta) { o.status = 'delivered'; this.pushMail('order@waimai.sandbox', `订单 ${o.id} 已送达`, '外卖已放在门口，记得确认收货。'); this.toast = { title: '外卖已送达', body: `${o.shop} · 订单 ${o.id}`, icon: 'PackageCheck' }; this.toastAge = 0; }
  }
  activeOrder() { return this.orders.slice().reverse().find((o) => ['awaiting', 'paid', 'delivered'].includes(o.status)) || null; }
  serialize() { const { rng, ...rest } = this; return JSON.parse(JSON.stringify(rest)); }
  static restore(state, { branchSeed } = {}) {
    const s = new SandboxOS({ seed: state.seed, skills: state.skills, branchSeed: branchSeed ?? state.branchSeed, address: state.address, init: false });
    const { seed, skills, branchSeed: _b, rngCalls, kind, ...rest } = state; Object.assign(s, JSON.parse(JSON.stringify(rest)));
    if ((branchSeed ?? state.branchSeed) === state.branchSeed) for (let i = 0; i < rngCalls; i++) s.rng();
    return s;
  }
}
const clampX = (x) => Math.max(0, Math.min(W - 1, Number(x) || 0));
const clampY = (y) => Math.max(0, Math.min(H - 1, Number(y) || 0));
module.exports = { SandboxOS, RESTAURANTS, PRODUCTS, DELIVERY_FEE, SITES, W, H };
