'use strict';
const fs = require('fs');
const path = require('path');
// 记忆：短期（最近事件）+ 长期（日记/反思/洞见）+ 只追加审计日志
// v0.5 记忆流架构（参考 Generative Agents / Smallville）：
//   每条观察带"重要度"（1–10）；检索分 = α·新近度 + β·重要度 + γ·相关度（关键词重叠）；
//   累计重要度超过阈值时触发"反思"：从高分记忆中归纳洞见，并引用证据（因果可追溯，L3）。
const IMPORTANCE = { thought: 1, action: 1, result: 2, system: 2, money: 5, payment: 6, human: 7, life: 6, error: 8 };
const REFLECT_THRESHOLD = 150; // 与 Generative Agents 一致
function tokens(s) { const t = String(s || '').replace(/[0-9$.,，。、：:（）()「」\s]+/g, ' '); const out = new Set(); for (const w of t.split(' ')) { if (!w) continue; if (/^[\u4e00-\u9fa5]+$/.test(w)) { for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2)); } else out.add(w.toLowerCase()); } return out; }
function overlap(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.sqrt(a.size * b.size); }
function importanceOf(kind, text) { let s = IMPORTANCE[kind] ?? 2; if (/拒绝|失败|去世|出生|违反|教训/.test(text)) s += 2; if (/收入 \+\$|批准/.test(text)) s += 1; return Math.min(10, s); }

class Memory {
  // fresh=true（新创世）：上一次运行的长期记忆归档为 memory.<时间戳>.json，新世界从空白记忆开始
  constructor(dir, { fresh = false } = {}) {
    this.dir = dir; this.short = []; this.long = []; this.acc = 0; this.reflections = 0; this.plan = null; this.lastRetrieval = [];
    if (dir) { fs.mkdirSync(dir, { recursive: true }); this.auditPath = path.join(dir, 'audit.jsonl'); this.memPath = path.join(dir, 'memory.json');
      if (fresh) { try { if (fs.existsSync(this.memPath)) fs.renameSync(this.memPath, path.join(dir, `memory.${Date.now()}.json`)); } catch {} }
      else { try { const m = JSON.parse(fs.readFileSync(this.memPath, 'utf8')); this.long = m.long || []; this.reflections = m.reflections || 0; this.plan = m.plan || null; } catch {} } }
  }
  add(kind, text, extra = {}) { const e = { at: Date.now(), kind, text, importance: importanceOf(kind, text), ...extra }; this.short.push(e); if (this.short.length > 200) this.short.shift(); this.acc += e.importance; return e; }
  remember(text, tag = 'reflection', clock, year, extra = {}) { const e = { at: Date.now(), tag, text, clock, year, importance: tag === 'lesson' || tag === 'insight' ? 1 : 0.5, ...extra }; this.long.push(e); this.save(); return e; }
  recent(n) { return this.short.slice(-n); }
  // 检索：新近度（按条目距今的序位指数衰减 0.98^k）+ 重要度 + 相关度，三者归一化后等权
  retrieve(query, k = 5) {
    const q = tokens(query); const pool = [...this.short.map((m, i, a) => ({ m, k: a.length - i, imp: m.importance / 10 })), ...this.long.map((m, i, a) => ({ m, k: (a.length - i) * 3, imp: m.importance }))];
    const scored = pool.map(({ m, k: age, imp }) => { const rec = Math.pow(0.98, age), rel = overlap(q, tokens(m.text)); return { text: m.text, tag: m.tag || m.kind, clock: m.clock, recency: +rec.toFixed(3), importance: +imp.toFixed(3), relevance: +rel.toFixed(3), score: +(rec + imp + rel * 1.5).toFixed(3) }; });
    const top = scored.sort((a, b) => b.score - a.score).slice(0, k); this.lastRetrieval = top.map((x) => ({ ...x, query: String(query).slice(0, 40) })); return top;
  }
  shouldReflect() { return this.acc >= REFLECT_THRESHOLD; }
  // 反思：确定性归纳（无 LLM 也可跑，L6 可复现）。统计最近 60 条高重要度事件，提炼 1–2 条洞见并附证据
  reflect(clock, year) {
    this.acc = 0; const ev = this.short.slice(-60); const out = [];
    const cnt = (re) => ev.filter((e) => re.test(e.text));
    const earn = cnt(/收入 \+\$/), rej = cnt(/拒绝了支出/), fail = cnt(/校验失败|失败/), eat = cnt(/吃完了/), god = ev.filter((e) => e.kind === 'human');
    if (earn.length >= 2) out.push([`最近 ${earn.length} 次交付都拿到了报酬：踏实接活是我活下去的根本。`, earn]);
    if (rej.length) out.push([`守护者最近拒绝了我 ${rej.length} 次花钱请求：先攒钱，再提需求。`, rej]);
    if (fail.length >= 3) out.push([`有 ${fail.length} 个动作没有达到预期：动手前先看清屏幕，失败就换个做法。`, fail]);
    if (eat.length) out.push([`吃饱后效率更高：饥饿会拖垮我，要提前安排吃饭。`, eat]);
    if (!out.length && god.length) out.push([`外面的观察者在关注我（${god.length} 次干预），我要更透明地记录自己做了什么。`, god]);
    if (!out.length) out.push([`最近比较平稳，按计划工作、休息、记录。`, ev.slice(-3)]);
    this.reflections++;
    const seen = new Set(this.long.filter((m) => m.tag === 'insight').slice(-4).map((m) => m.text));
    const pick = (out.filter(([t]) => !seen.has(t)).length ? out.filter(([t]) => !seen.has(t)) : out.slice(0, 1)).slice(0, 2);
    return pick.map(([text, evs]) => this.remember(seen.has(text) ? '（再次确认）' + text : text, 'insight', clock, year, { evidence: evs.slice(-3).map((e) => e.text.slice(0, 40)) }));
  }
  // 每日计划（Smallville 的"一天粗计划"）：基于余额、饥饿、最近洞见
  makePlan(day, ctx) {
    const items = [];
    if (ctx.hunger > 0.4) items.push('先解决吃饭（需守护者批准付款）');
    items.push(ctx.balance < 20 ? '多接任务，把余额提到 $20 以上' : '接与技能匹配的高价任务');
    items.push('下午检查邮箱，回复客户');
    items.push('晚上写日记，复盘今天');
    const ins = this.long.filter((m) => m.tag === 'insight').slice(-1)[0]; if (ins) items.push('记住：' + ins.text.slice(0, 24));
    this.plan = { day, items }; this.save(); return this.plan;
  }
  audit(entry) { if (this.auditPath) fs.appendFileSync(this.auditPath, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); }
  save() { if (this.memPath) fs.writeFileSync(this.memPath, JSON.stringify({ long: this.long.slice(-500), reflections: this.reflections, plan: this.plan }, null, 2)); }
  serialize() { return JSON.parse(JSON.stringify({ short: this.short, long: this.long, reflections: this.reflections, plan: this.plan, acc: this.acc })); }
  restore(st) { this.short = st.short || []; this.long = st.long || []; this.reflections = st.reflections || 0; this.plan = st.plan || null; this.acc = st.acc || 0; this.save(); }
  // 记忆衰减（艾宾浩斯）：strength = e^(−Δ年 / τ)，τ = 8 × (1 + importance) 年；只衰减不增强（L16）
  summary(year) {
    const long = this.long.slice(-30).map((m) => ({ ...m, strength: year !== undefined && m.year !== undefined ? Math.round(Math.exp(-Math.max(0, year - m.year) / (8 * (1 + (m.importance ?? 0.5)))) * 1000) / 1000 : 1 }));
    return { short: this.short.slice(-30), long, reflections: this.reflections, plan: this.plan, pressure: Math.min(1, +(this.acc / REFLECT_THRESHOLD).toFixed(2)), retrieval: this.lastRetrieval, insights: this.long.filter((m) => m.tag === 'insight').slice(-6) };
  }
}
module.exports = { Memory, REFLECT_THRESHOLD };
