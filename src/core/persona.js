'use strict';
const { createRng } = require('./prng');

const SURNAMES = ['林', '陈', '周', '沈', '苏', '顾', '叶', '许', '江', '陆', '白', '温'];
const GIVEN = ['星野', '若川', '知夏', '一舟', '听澜', '予安', '青禾', '未央', '景行', '慕白', '南乔', '溪云'];
const CITY_ZH = {
  'harbor-metropolis': '雾港市', 'mountain-town': '云岭镇', 'desert-oasis': '绿洲城', 'river-delta-city': '三角洲城',
  'island-village': '潮汐村', 'neon-megacity': '霓虹都会', 'university-town': '学府镇',
};
const FAMILY_ZH = {
  'single-parent': '由单亲母亲抚养长大', 'big-family': '在一个热闹的大家庭里长大', grandparents: '跟着祖父母长大',
  'two-parents': '在普通的双职工家庭长大', orphanage: '在福利院长大，早早学会独立', nomadic: '随家人四处迁徙',
};
const SKILL_ZH = {
  writing: '写作', translation: '翻译', illustration: '插画', python: 'Python 编程', 'web-design': '网页设计',
  'data-entry': '数据整理', 'video-script': '视频脚本', research: '资料调研',
};
const VALUE_ZH = { autonomy: '自由', craft: '手艺', security: '安全感', community: '社群', adventure: '冒险', knowledge: '知识', kindness: '善意', ambition: '抱负' };

function traitLabels(g) {
  const L = [];
  L.push(g.openness > 0.6 ? '好奇开放' : g.openness < 0.35 ? '务实保守' : '兼收并蓄');
  L.push(g.conscientiousness > 0.6 ? '自律严谨' : g.conscientiousness < 0.35 ? '随性散漫' : '张弛有度');
  L.push(g.extraversion > 0.6 ? '外向健谈' : g.extraversion < 0.35 ? '内向安静' : '内外兼修');
  L.push(g.agreeableness > 0.6 ? '温和友善' : g.agreeableness < 0.35 ? '直率犀利' : '有分寸');
  L.push(g.neuroticism > 0.6 ? '敏感多虑' : '情绪稳定');
  L.push(g.frugality > 0.6 ? '节俭' : g.frugality < 0.35 ? '舍得花钱' : '理性消费');
  L.push(g.risk_tolerance > 0.6 ? '敢于冒险' : '稳健');
  return L;
}

function buildPersona(dna, { operator = process.env.ALOS_OPERATOR_NAME || '（请在 .env 设置 ALOS_OPERATOR_NAME）', simYear = 2026 } = {}) {
  const r = createRng(dna.seed, 'persona');
  const name = r.pick(SURNAMES) + r.pick(GIVEN);
  const city = CITY_ZH[dna.origin.city_archetype] || dna.origin.city_archetype;
  const age = simYear - dna.origin.birth_year;
  const skills = dna.skills.map((s) => SKILL_ZH[s] || s);
  const values = dna.values.map((v) => VALUE_ZH[v] || v);
  const turning = r.pick([
    '一次意外的失业让 TA 决定靠手艺独立谋生', '一位陌生人的善意让 TA 想把温暖传递下去', '大学时开的小网店失败了，却让 TA 学会了复盘',
    '在旧书摊淘到一本编程书，从此打开新世界', '一场长途旅行让 TA 明白了自己真正想要的生活',
  ]);
  const goal = r.pick(['攒够第一笔 100 美元的独立收入', '每天完成一项有价值的工作', '建立稳定可持续的自由职业收入', '用作品被更多人看见']);
  const lifeStory = [
    { title: '出生', text: `${dna.origin.birth_year} 年，${name}出生在${city}，${FAMILY_ZH[dna.origin.family] || ''}。` },
    { title: '成长', text: `TA 从小对${skills[0]}着迷，后来又学会了${skills[1]}和${skills[2]}。` },
    { title: '转折', text: `${turning}。` },
    { title: '信念', text: `TA 最看重${values.join('与')}，性格${traitLabels(dna.genome).slice(0, 3).join('、')}。` },
    { title: '现在', text: `${age} 岁的 TA 搬进了一台名为「世界」的机器里，目标是：${goal}。` },
  ];
  const fp = dna.fingerprint;
  const profileCard = {
    fictional: true,
    cardType: 'Agent Profile Card · 世界内角色档案卡',
    id: `ALOS-${fp.slice(0, 4)}-${fp.slice(4, 8)}`,
    name, age, homeWorld: city, traits: traitLabels(dna.genome).slice(0, 4), dnaFingerprint: fp,
    legalOwner: operator,
    watermark: 'FICTIONAL · 虚构角色档案 · 非真实证件 · NOT A GOVERNMENT ID',
    disclaimer: '本卡为虚构角色档案，不代表任何真实身份，不可用于任何现实身份核验。该智能体名下的所有账户、支付工具与收益在法律上归人类操作者所有。',
  };
  return { name, age, city, skills, values, traits: traitLabels(dna.genome), goal, lifeStory, profileCard };
}

module.exports = { buildPersona, traitLabels };
