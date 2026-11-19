'use strict';
// 科技树：每项科技有前置条件与成本（累计研究点），解锁严格遵守前置（定律 L15）。
// epc = 人均能耗（瓦），用于卡尔达肖夫指数 K = (log10 P − 6) / 10（Sagan 1973 插值公式）。
const TECHS = [
  { id: 'fire', name: '用火', era: 0, cost: 0, req: [], epc: 100, desc: '熟食与取暖' },
  { id: 'language', name: '语言', era: 0, cost: 0, req: [], desc: '知识得以口传' },
  { id: 'tools', name: '石器工具', era: 0, cost: 6, req: ['fire'], prod: 0.1, desc: '劳动生产率 +10%' },
  { id: 'agriculture', name: '农业', era: 1, cost: 14, req: ['tools'], food: 0.7, epc: 300, desc: '粮食产量 +70%' },
  { id: 'writing', name: '文字', era: 1, cost: 22, req: ['language', 'agriculture'], edu: 0.15, inst: 0.1, desc: '教育与制度的基础' },
  { id: 'metallurgy', name: '冶金', era: 1, cost: 30, req: ['tools'], prod: 0.2, epc: 600, desc: '生产率 +20%' },
  { id: 'law', name: '成文法', era: 1, cost: 36, req: ['writing'], inst: 0.2, desc: '制度 +，冲突 −' },
  { id: 'medicine', name: '传统医学', era: 1, cost: 40, req: ['writing'], mort: 0.85, desc: '死亡风险 ×0.85' },
  { id: 'printing', name: '印刷术', era: 2, cost: 60, req: ['writing', 'metallurgy'], edu: 0.2, lang: 0.3, desc: '教育 +，语言趋同' },
  { id: 'science', name: '科学方法', era: 2, cost: 90, req: ['printing'], rate: 0.3, desc: '研究速度 +30%' },
  { id: 'steam', name: '蒸汽机', era: 2, cost: 120, req: ['science', 'metallurgy'], prod: 0.4, epc: 3000, emit: 1, desc: '工业革命' },
  { id: 'vaccine', name: '疫苗', era: 2, cost: 150, req: ['science', 'medicine'], disease: 0.4, mort: 0.8, desc: '疫病 ×0.4' },
  { id: 'electricity', name: '电力', era: 3, cost: 180, req: ['steam'], prod: 0.4, epc: 8000, emit: 1.2, desc: '电气时代' },
  { id: 'computing', name: '计算机', era: 3, cost: 260, req: ['electricity', 'science'], prod: 0.3, edu: 0.2, epc: 10000, desc: '信息时代' },
  { id: 'internet', name: '互联网', era: 3, cost: 340, req: ['computing'], lang: 0.4, coop: 0.2, desc: '全球协作，语言趋同' },
  { id: 'ai', name: '人工智能', era: 4, cost: 450, req: ['internet'], rate: 0.5, prod: 0.5, desc: '研究速度 +50%' },
  { id: 'fusion', name: '可控核聚变', era: 4, cost: 600, req: ['electricity', 'ai'], epc: 100000, emit: -1.5, desc: '清洁能源，气候回落' },
  { id: 'space', name: '太空殖民', era: 5, cost: 800, req: ['fusion'], cap: 0.5, epc: 1e6, resil: 0.4, desc: '承载力 +50%，抗灾' },
  { id: 'dyson', name: '戴森群', era: 5, cost: 1200, req: ['space'], epc: 1e8, desc: '恒星级能源' },
];
const ERAS = ['原始时代', '农业时代', '工业前夜', '工业与电气时代', '智能时代', '星际时代'];
const START_ERAS = { primitive: ['fire', 'language'], agrarian: ['fire', 'language', 'tools', 'agriculture', 'writing'], industrial: ['fire', 'language', 'tools', 'agriculture', 'writing', 'metallurgy', 'law', 'medicine', 'printing', 'science', 'steam'] };
START_ERAS.information = [...START_ERAS.industrial, 'vaccine', 'electricity', 'computing', 'internet'];
const BY_ID = Object.fromEntries(TECHS.map((t) => [t.id, t]));
function effects(unlocked) {
  const e = { prod: 0, food: 0, edu: 0, inst: 0, mort: 1, disease: 1, lang: 0, coop: 0, rate: 0, cap: 0, resil: 0, epc: 100, emit: 0, era: 0 };
  for (const id of unlocked) {
    const t = BY_ID[id]; if (!t) continue;
    for (const k of ['prod', 'food', 'edu', 'inst', 'lang', 'coop', 'rate', 'cap', 'resil', 'emit']) if (t[k]) e[k] += t[k];
    if (t.mort) e.mort *= t.mort; if (t.disease) e.disease *= t.disease;
    if (t.epc) e.epc = Math.max(e.epc, t.epc); e.era = Math.max(e.era, t.era);
  }
  e.emit = Math.max(0, e.emit);
  return e;
}
function available(unlocked) { const s = new Set(unlocked); return TECHS.filter((t) => !s.has(t.id) && t.req.every((r) => s.has(r))); }
function kardashev(powerW) { return powerW > 0 ? Math.round(((Math.log10(powerW) - 6) / 10) * 1000) / 1000 : 0; }
module.exports = { TECHS, ERAS, START_ERAS, BY_ID, effects, available, kardashev };
