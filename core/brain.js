'use strict';
// 大脑：有 LLM 时用 LLM 决策；否则用由 DNA 驱动的规则策略（离线可跑）
const { chatJSON, llmEnabled } = require('./llm');

function systemPrompt(persona, dna, worldKind) {
  return [
    `你是「${persona.name}」，一个生活在虚拟机（你的"世界"）里的虚构 AI 角色。${persona.lifeStory.map((c) => c.text).join('')}`,
    `性格：${persona.traits.join('、')}。技能：${persona.skills.join('、')}。目标：${persona.goal}`,
    '规则：只做合法且诚实的工作；花钱必须经人类守护者批准；不得冒充真人、不得绕过验证码或平台风控；对外交流需表明自己是 AI。',
    worldKind === 'sim'
      ? '每一步只输出一个 JSON：{"thought":"简短中文想法","action":{"type":"click","target":"元素id"}} 或 {"type":"type","text":"..."} 或 {"type":"rest"}。target 必须来自可交互元素列表。'
      : '你看到的是 VM 截图。每一步只输出一个 JSON：{"thought":"简短中文想法","action":{"type":"click","x":数字,"y":数字} | {"type":"type","text":"..."} | {"type":"key","keys":"ctrl+l"} | {"type":"wait"}}。',
  ].join('\n');
}

async function llmDecide({ persona, dna, obs, memory, instruction }) {
  const recent = memory.recent(8).map((m) => `${m.kind}: ${m.text}`).join('\n');
  const rel = memory.retrieve ? memory.retrieve(obs.text.slice(0, 200), 4).map((m) => '- ' + m.text).join('\n') : '';
  const userText = `${instruction ? `【守护者指令】${instruction}\n` : ''}${memory.plan ? '今日计划：' + memory.plan.items.join('；') + '\n' : ''}${rel ? '相关长期记忆：\n' + rel + '\n' : ''}最近记忆：\n${recent || '（无）'}\n\n当前观察：\n${obs.text}`;
  const content = obs.image ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: obs.image } }] : userText;
  const out = await chatJSON([{ role: 'system', content: systemPrompt(persona, dna, obs.kind) }, { role: 'user', content }]);
  if (!out.action || !out.action.type) throw new Error('LLM 输出缺少 action');
  return { thought: String(out.thought || ''), action: out.action, source: 'llm' };
}

// 规则策略（仅 sim 世界）
function ruleDecide({ persona, dna, obs, wallet, pendingPayments, step }) {
  const g = dna.genome;
  const ids = new Set(obs.elements.map((e) => e.id));
  const click = (target, thought) => ({ thought, action: { type: 'click', target }, source: 'rules' });
  if (obs.energy < 25) return { thought: '有点累了，先休息一下再继续。', action: { type: 'rest' }, source: 'rules' };
  if (obs.hunger >= 0.7 && !pendingPayments && wallet.balance > 4) {
    if (obs.openApp !== 'shop') return click('dock:shop', `饿了（饥饿 ${Math.round(obs.hunger * 100)}%），去商店买份便当。`);
    return click('buy:item-meal', '点一份外卖便当（需要守护者批准）。');
  }
  if (step > 0 && (step % 17 === 0 || (step % 17 === 1 && obs.openApp === 'notes'))) {
    if (obs.openApp !== 'notes') return click('dock:notes', '该写今天的日记了。');
    return { thought: '记录一下今天。', action: { type: 'type', text: `今天${obs.clock}，余额 $${wallet.balance}。${g.neuroticism > 0.6 ? '有点焦虑，但还在努力。' : '一切按计划进行。'}` }, source: 'rules' };
  }
  // 有钱且未购买效率工具时，考虑投资（节俭的人更犹豫）
  if (!pendingPayments && wallet.balance > 12 && g.frugality < 0.75 && (step % 9 === 4 || (step % 9 === 5 && obs.openApp === 'shop'))) {
    if (obs.openApp !== 'shop') return click('dock:shop', '看看商店里有没有能提升效率的工具。');
    const tool = obs.elements.find((e) => e.id.startsWith('buy:') && !e.label.includes('已拥有') && !e.id.includes('coffee') && persona.skills.some((s) => e.label.includes('加成:' + s)));
    if (tool) return click(tool.id, '这个工具能让我更高效，值得投资（需要守护者批准）。');
    if (obs.energy < 70) return click('buy:item-coffee', '没有适合我的工具，买杯咖啡提提神吧（需要守护者批准）。');
  }
  const cur = obs.currentTask;
  if (cur) {
    if (obs.openApp !== 'jobs') return click('dock:jobs', '回到任务板继续工作。');
    if (cur.progress >= cur.effort) return click('btn:submit', `「${cur.title}」做完了，提交给客户。`);
    return click('btn:work', `专心做「${cur.title}」。`);
  }
  if (obs.elements.some((e) => e.id.startsWith('mail:') && e.label.startsWith('[未读]')) && obs.openApp === 'mail') {
    const m = obs.elements.find((e) => e.id.startsWith('mail:') && e.label.startsWith('[未读]'));
    return click(m.id, '读一下新邮件。');
  }
  if (step % 11 === 6) return click('dock:mail', '检查一下邮箱。');
  if (obs.openApp !== 'jobs') return click('dock:jobs', '去任务板找活干。');
  const tasks = obs.elements.filter((e) => e.id.startsWith('task:'));
  if (!tasks.length) return { thought: '暂时没有任务，休息一下。', action: { type: 'rest' }, source: 'rules' };
  const score = (e) => { const m = e.label.match(/\$(\d+(\.\d+)?)/); const reward = m ? +m[1] : 0; const mine = persona.skills.some((s) => e.label.includes('技能:' + s)) ? 1.5 : 1; return reward * mine * (g.risk_tolerance > 0.6 ? 1 : 0.9); };
  const best = tasks.sort((a, b) => score(b) - score(a))[0];
  return click(best.id, `接下这个：${best.label.split('｜')[0]}，看起来适合我。`);
}

async function decide(ctx) {
  if (llmEnabled()) {
    try { return await llmDecide(ctx); } catch (e) { if (ctx.obs.kind !== 'sim') throw e; const r = ruleDecide(ctx); r.thought = `（LLM 出错，改用规则：${e.message.slice(0, 80)}）` + r.thought; return r; }
  }
  if (ctx.obs.kind !== 'sim') return { thought: '未配置 LLM，无法理解 VM 截图，等待中。', action: { type: 'wait' }, source: 'none' };
  return ruleDecide(ctx);
}
module.exports = { decide, ruleDecide, systemPrompt };
