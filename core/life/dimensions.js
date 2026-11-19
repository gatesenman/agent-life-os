'use strict';
// 世界维度体系：8 大维度 × 子维度。每个子维度声明：状态变量、规则（如何进入 F）、受哪条定律约束、God Mode 可调参数。
// 这是"世界终极公式" S(t+1)=F(S(t),a(t),h(t);R,σ) 中 S 与 R 的分解。
const DIMENSIONS = [
  { id: 'life', name: '生命', icon: 'HeartPulse', summary: '个体从出生到死亡的生物过程', subs: [
    { id: 'birth', name: '出生', state: 'born, parents, gen', rule: '有伴侣且处于生育年龄（14–50 岁）的母亲按生育率与粮食充足度生育', laws: ['L13', 'L14'], config: ['fertility'] },
    { id: 'aging', name: '衰老', state: 'age, lifeStage', rule: '年龄由世界时间推出；人生阶段：婴儿、童年、少年、青年、成年、中年、老年', laws: ['L4', 'L8'], config: ['yearsPerDay'] },
    { id: 'health', name: '健康', state: 'health ∈ [0,1]', rule: '健康取决于年龄、体质基因、疾病和营养', laws: ['L16'], config: [] },
    { id: 'disease', name: '疾病', state: 'disease, epidemics', rule: '疫病按泊松过程爆发，人口越密集越容易爆发，医疗科技和医院会降低发生率', laws: ['L8'], config: ['diseaseRate'] },
    { id: 'mortality', name: '死亡', state: 'died, cause', rule: 'Gompertz 风险 h = a·e^(b·age)，再乘体质、医疗、饥荒、疾病系数；年龄到寿命上限必然死亡', laws: ['L8'], config: ['maxLifespan'] },
    { id: 'needs', name: '需求层级', state: 'needs{生理,安全,归属,尊重,自我实现}', rule: '马斯洛五层需求，由粮食、财富、家庭、声望、技能与意义感计算', laws: ['L16'], config: [] },
  ] },
  { id: 'genetics', name: '遗传', icon: 'Dna', summary: '性状如何跨代传递和演化', subs: [
    { id: 'inheritance', name: '双亲遗传', state: 'alleles{性状:[a,b]}', rule: '10 个性状，每个性状两条等位基因；子代从父母各继承一条', laws: ['L9'], config: [] },
    { id: 'mutation', name: '突变', state: 'mutations[]', rule: '每条等位基因以突变率发生高斯扰动，并被记录', laws: ['L9'], config: ['mutationRate'] },
    { id: 'expression', name: '性状表达', state: 'phenotype', rule: '表型 = 两条等位基因的均值 + 后天漂移（漂移不遗传）', laws: ['L9'], config: [] },
    { id: 'selection', name: '自然选择与演化', state: 'meanTraits by generation', rule: '体质基因影响死亡风险，强度由选择强度决定；各代性状均值的变化即演化', laws: ['L9'], config: ['selection'] },
  ] },
  { id: 'mind', name: '心智', icon: 'Brain', summary: '个体的内在世界', subs: [
    { id: 'emotion', name: '情绪', state: 'joy, sadness, fear, anger', rule: '需求满足带来喜悦；丧亲、灾害、不平等分别带来悲伤、恐惧、愤怒；每年按指数衰减', laws: ['L16'], config: [] },
    { id: 'memory', name: '记忆衰减', state: 'memory.strength', rule: '艾宾浩斯式遗忘 s = e^(−Δt/τ)，越重要的记忆 τ 越大', laws: ['L16'], config: [] },
    { id: 'learning', name: '学习', state: 'skill, education', rule: '技能随练习、智力和教育增长，增长有上限', laws: ['L16'], config: [] },
    { id: 'drift', name: '人格漂移', state: 'drift{}', rule: '30 岁后开放性缓慢下降，60 岁前尽责性缓慢上升，|漂移| ≤ 0.2', laws: ['L9'], config: [] },
    { id: 'belief', name: '信念', state: 'belief', rule: '多数人继承父母的信念，少数受文化影响改信', laws: [], config: [] },
    { id: 'meaning', name: '意识与意义', state: 'meaning ∈ [0,1]', rule: '由高层需求、子女、信念和技能综合得出', laws: ['L16'], config: [] },
  ] },
  { id: 'social', name: '社会', icon: 'Users', summary: '人与人之间的结构', subs: [
    { id: 'family', name: '家庭与家谱', state: 'parents, children, partner', rule: '每个孩子恰好有两位亲本，代数 = 亲本最大代数 + 1', laws: ['L14'], config: [] },
    { id: 'relationship', name: '伴侣关系', state: 'partner', rule: '成年单身者按宜人性相近程度结成伴侣；一方去世后另一方可再婚', laws: [], config: [] },
    { id: 'reproduction', name: '繁衍', state: 'births', rule: '受粮食、承载力和生育率约束', laws: ['L13'], config: ['fertility'] },
    { id: 'reputation', name: '声望', state: 'reputation', rule: '劳动贡献和合作提升声望，冲突降低声望', laws: [], config: [] },
    { id: 'conflict', name: '合作与冲突', state: 'cooperation, conflicts', rule: '不平等高且制度弱时容易爆发冲突；互联网等科技促进合作', laws: ['L8'], config: [] },
    { id: 'groups', name: '群体', state: 'clans, belief groups', rule: '按姓氏形成宗族，按信念形成社群', laws: [], config: [] },
  ] },
  { id: 'economy', name: '经济', icon: 'Coins', summary: '社会内部的粮币经济（与智能体的美元钱包分离）', subs: [
    { id: 'labor', name: '劳动', state: 'wage', rule: '劳动人口创造价值 = 技能 × 科技生产率', laws: ['L10'], config: [] },
    { id: 'scarcity', name: '稀缺', state: 'food ratio', rule: '粮食 = 农业 + 狩猎，受资源与气候约束；不足时出现饥荒', laws: ['L12'], config: [] },
    { id: 'trade', name: '交易', state: 'transfers', rule: '成年人之间零和转移', laws: ['L10'], config: [] },
    { id: 'inflation', name: '通胀', state: 'priceIndex', rule: '价格指数随货币存量与产出之比调整', laws: [], config: [] },
    { id: 'estate', name: '财富继承', state: 'estate', rule: '去世者的遗产依次分给在世子女、伴侣，否则归公库；总额严格守恒', laws: ['L10'], config: [] },
  ] },
  { id: 'civ', name: '文明', icon: 'Landmark', summary: '跨越世代积累的集体成就', subs: [
    { id: 'tech', name: '科技树', state: 'unlocked[], research', rule: '研究点来自人口、好奇心和教育；必须先满足前置科技才能解锁', laws: ['L15'], config: ['techRate', 'startEra'] },
    { id: 'culture', name: '文化', state: 'culture', rule: '由开放性、文化中心和人口积累', laws: [], config: [] },
    { id: 'language', name: '语言', state: 'dialects', rule: '人口分散时方言分化，印刷术和互联网使语言趋同', laws: [], config: [] },
    { id: 'institution', name: '制度与法律', state: 'institutions ∈ [0,1]', rule: '由文字、成文法和稳定度推动；能降低冲突', laws: [], config: [] },
    { id: 'kardashev', name: '卡尔达肖夫等级', state: 'K', rule: 'K = (log10 P − 6) / 10，P = 人口 × 代表倍数 × 人均能耗', laws: ['L15'], config: [] },
    { id: 'collapse', name: '兴衰', state: 'stability, collapses', rule: '稳定度持续低于 0.25 满 3 年即崩溃：失去最新科技，制度减半', laws: ['L15'], config: [] },
  ] },
  { id: 'env', name: '环境与生态', icon: 'Trees', summary: '承载一切的物理与生物环境', subs: [
    { id: 'resources', name: '资源', state: 'renewable, nonrenewable', rule: '可再生资源按逻辑斯蒂方程再生；不可再生资源只减不增', laws: ['L12'], config: ['resourceRegen'] },
    { id: 'climate', name: '气候', state: 'anomaly °C', rule: '排放使气温升高，自然恢复使其回落；天气由气候和季节派生', laws: [], config: ['climateSensitivity'] },
    { id: 'species', name: '其他物种与食物链', state: 'prey, predators', rule: 'Lotka–Volterra 捕食模型，人类狩猎草食动物', laws: ['L12'], config: [] },
    { id: 'disaster', name: '灾害', state: 'disasters[]', rule: '地震、洪水、干旱、山火、风暴按泊松过程发生，气候异常越大越频繁', laws: ['L8'], config: ['disasterRate'] },
    { id: 'entropy', name: '熵', state: 'entropy', rule: '能耗、死亡和时间流逝都使熵增加，熵永不减少', laws: ['L11'], config: [] },
  ] },
  { id: 'fate', name: '时间与命运', icon: 'Hourglass', summary: '随机性、因果与世代', subs: [
    { id: 'chance', name: '随机与因果', state: 'rngCalls, causes', rule: '一切随机都来自种子派生的计数 PRNG；每个事件都记录原因', laws: ['L3', 'L6'], config: [] },
    { id: 'generations', name: '世代', state: 'gen, lineage', rule: '主角去世后由继承人接续，血脉断绝则世界进入终局', laws: ['L14'], config: [] },
    { id: 'time', name: '时间尺度', state: 'year', rule: '纪元年由世界时间按“每世界日 N 年”压缩推进，单调不减', laws: ['L4'], config: ['yearsPerDay'] },
  ] },
];
const BASE_LAWS = {
  L1: { name: '货币守恒', text: '余额等于流水之和；每次余额变化恰好对应一条流水。' },
  L2: { name: '货币边界', text: '美元只经注资或工作收入流入、经已批准支出流出；余额不为负。' },
  L3: { name: '因果', text: '事件序号单调；每个结果与收支都有原因。' },
  L4: { name: '时间之箭', text: '世界时间与纪元年单调不减。' },
  L5: { name: '熵与需求', text: '能量随时间衰减，能量与心情有界。' },
  L6: { name: '可复现', text: '相同种子与人类输入得到相同轨迹。' },
  L7: { name: '分支隔离', text: '平行世界互不影响，不合并。' },
};
const NEW_LAWS = {
  L8: { name: '必死律', text: '没有人能活过寿命上限；每个死者都有死因和死亡时间，且死亡时间不早于出生；死者不能复活。' },
  L9: { name: '遗传守恒', text: '子代的每条等位基因都来自对应亲本，突变除外，且突变必须被记录。人格漂移只改变表型，不改变基因。' },
  L10: { name: '财富守恒与继承', text: 'Σ在世者财富 + 公库 = 累计创造 − 累计消耗；死者财富为 0，遗产分配前后总额不变。' },
  L11: { name: '熵增', text: '世界总熵永不减少。' },
  L12: { name: '资源有限', text: '资源 ∈ [0, 容量]；不可再生资源只减不增；物种数量不为负。' },
  L13: { name: '人口守恒', text: '在世人口 = 始祖 + 累计出生 − 累计死亡。' },
  L14: { name: '世代因果', text: '新生儿恰有两位在世亲本，母亲处于 14–50 岁；子代代数 = 亲本最大代数 + 1。' },
  L15: { name: '文明有界', text: '已解锁科技的前置必须全部解锁（崩溃时连同依赖一起失去）；卡尔达肖夫等级由能耗按公式计算，不能凭空设定。' },
  L16: { name: '心智有界', text: '健康、需求、情绪、意义感 ∈ [0,1]，心情 ∈ [−1,1]；记忆强度只会衰减，不会自行增强。' },
  L17: { name: '代谢律', text: '饥饿 ∈ [0,1]，只随世界时间上升；只有进食事件能让它下降，且每次吃外卖都对应一笔已支付的订单流水。' },
  L18: { name: '人机边界', text: '智能体只能用屏幕坐标级的键鼠动作操作电脑；电脑里每笔已支付的订单都有经过预算策略与人工审批的支出流水，未支付的订单不产生扣款；接管期间智能体不得动作。' },
};
module.exports = { DIMENSIONS, NEW_LAWS, BASE_LAWS };
