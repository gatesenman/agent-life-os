'use strict';
// 世界的"终极公式"：所有模块都必须遵守的统一状态转移模型
//
//   S(t+1) = F( S(t), a(t), h(t) ; R, σ )
//
//   S = (W 世界, E 经济, M 心智, P 策略, A 待审批)   世界完整状态
//   a(t) = π( O(S(t)), M(t) )                        智能体动作（观察 → 决策）
//   h(t)                                             人类输入（批准/拒绝/注入/接管）= 外部事件
//   R                                                规则（本文件中的定律 + 世界规则）
//   σ = (seed, branchSeed, rngCalls)                 随机源；平行世界只改变 σ 或 R
//
// 定律（每一步之后由 checkInvariants 校验，违反即记录为错误事件）：
//   L1 货币守恒：余额 = Σ 流水；每次余额变化恰有一条流水。
//   L2 货币边界：钱只能经 earn（交付工作，外部客户付款）或 fund（操作者注资）流入；
//      只能经 spend 流出，且 spend 必须有批准（人工或策略自动）；余额永不为负。
//   L3 因果：结果/收支事件必须引用其原因动作；事件序号单调递增，果不先于因。
//   L4 时间之箭：世界时间单调不减，每个动作消耗 Δt > 0。
//   L5 熵与需求：能量随时间衰减（2 点/小时，休息除外），工作额外消耗；能量 ∈ [0,100]，心情 ∈ [0,1]。
//   L6 可复现：给定 (σ, 规则大脑, h 序列)，轨迹完全可复现；LLM 大脑被记录为非确定性来源。
//   L7 分支隔离：分叉复制某一时刻的 S，各分支之后互不影响，不做合并。
//   —— 世界维度体系扩展（core/life/dimensions.js）——
//   L8 必死律  L9 遗传守恒  L10 财富守恒与继承  L11 熵增  L12 资源有限  L13 人口守恒  L14 世代因果  L15 文明有界  L16 心智有界
//   —— 智能体桌面扩展（core/desktop）——
//   L17 代谢律：饥饿 ∈ [0,1]，只随世界时间上升；只有“进食”事件能让它下降，且每次进食都对应一笔已支付的订单。
//   L18 人机边界：智能体只能用屏幕坐标级的键鼠动作操作电脑；电脑里的每笔已支付订单都有对应的 spend 流水（经过策略/审批），
//       待审批的订单没有任何扣款；接管期间智能体不发出动作。
const LAWS = {
  L1: '货币守恒', L2: '货币边界', L3: '因果', L4: '时间之箭', L5: '熵与需求', L6: '可复现', L7: '分支隔离',
  L8: '必死律', L9: '遗传守恒', L10: '财富守恒与继承', L11: '熵增', L12: '资源有限', L13: '人口守恒', L14: '世代因果', L15: '文明有界', L16: '心智有界', L17: '代谢律', L18: '人机边界',
};

function checkInvariants(engine, prev) {
  const v = [];
  const p = engine.adapters.payment;
  const sum = +p.ledger.reduce((a, t) => a + t.amount, 0).toFixed(2);
  if (Math.abs(sum - p.balance) > 0.005) v.push(['L1', `余额 ${p.balance} ≠ 流水合计 ${sum}`]);
  if (p.balance < -0.005) v.push(['L2', `余额为负 ${p.balance}`]);
  for (const t of p.ledger) {
    if (!['fund', 'earn', 'spend'].includes(t.type)) v.push(['L2', `未知流水类型 ${t.type}`]);
    if (t.type === 'spend' && !t.approval) v.push(['L2', `支出缺少批准记录：${t.memo}`]);
    if (t.type === 'earn' && t.amount <= 0) v.push(['L2', '收入必须为正']);
  }
  const tl = engine.timeline;
  for (let i = 1; i < tl.length; i++) if (tl[i].seq <= tl[i - 1].seq) { v.push(['L3', '事件序号非单调']); break; }
  for (const e of tl.slice(-40)) if (['result', 'money'].includes(e.kind) && e.cause === undefined) { v.push(['L3', `事件缺少原因：${e.text.slice(0, 20)}`]); break; }
  const w = engine.world;
  if (w.absMinutes) {
    const now = w.absMinutes();
    if (prev && now < prev.time) v.push(['L4', '世界时间倒流']);
    if (w.energy < 0 || w.energy > 100) v.push(['L5', `能量越界 ${w.energy}`]);
    if (w.mood < 0 || w.mood > 1) v.push(['L5', `心情越界 ${w.mood}`]);
  }
  if (w.hunger !== undefined) {
    if (w.hunger < 0 || w.hunger > 1) v.push(['L17', `饥饿越界 ${w.hunger}`]);
    if (prev && prev.hunger !== undefined && w.hunger < prev.hunger - 1e-6 && !(engine.ateThisStep)) v.push(['L17', `饥饿在没有进食的情况下下降 ${prev.hunger} → ${w.hunger}`]);
    if (engine.ateThisStep && engine.ateThisStep.order) { const o = engine.desktop?.os.orders.find((x) => x.id === engine.ateThisStep.order); if (!o || !o.tx || !p.ledger.some((t) => t.type === 'spend' && t.ref === o.tx)) v.push(['L17', `进食没有对应的已支付订单 ${engine.ateThisStep.order}`]); }
  }
  if (engine.desktop) {
    const os = engine.desktop.os;
    for (const o of [...os.orders, ...os.purchases]) {
      const paid = ['paid', 'delivered', 'eaten'].includes(o.status);
      const tx = p.ledger.find((t) => t.type === 'spend' && String(t.memo || '').includes(o.id));
      if (paid && (!tx || !tx.approval)) v.push(['L18', `订单 ${o.id} 已支付但没有经过审批的流水`]);
      if (!paid && tx) v.push(['L18', `订单 ${o.id} 未支付却产生了扣款`]);
    }
    const la = engine.lastDesktopAction; if (la && !['move', 'click', 'double_click', 'type', 'key', 'scroll', 'wait', 'rest', 'request_payment', 'done'].includes(la.type)) v.push(['L18', `非键鼠动作 ${la.type}`]);
    if (engine.takeover && engine.agentActedDuringTakeover) v.push(['L18', '接管期间智能体发出了动作']);
  }
  if (engine.society && prev && prev.society) for (const x of engine.society.checkLaws(prev.society)) v.push(x);
  return v.map(([law, msg]) => ({ law, name: LAWS[law], msg }));
}

module.exports = { checkInvariants, LAWS };
