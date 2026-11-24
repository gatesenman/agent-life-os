import React from 'react';
import { BookOpen, Archive, Clock, Gauge, ListChecks, Lightbulb, ScanSearch } from 'lucide-react';
import { Card, Meter } from '../components/ui.jsx';
const TAG = { diary: '日记', lesson: '教训', reflection: '反思', insight: '洞见', talk: '对话' };
const KIND = { thought: '思考', action: '动作', result: '结果', money: '收支', payment: '支付', human: '干预', system: '系统', error: '错误', life: '生命', talk: '对话', social: '社交' };
export default function Memory({ s }) {
  const { persona, memory, world } = s;
  return (
    <div className="view cols2">
      <div className="col">
        <Card title="人生故事" icon={BookOpen} actions={<span className="muted small">由 DNA 确定性生成</span>}>
          <ol className="story">
            {persona.lifeStory.map((c) => <li key={c.title}><span className="story-t">{c.title}</span><p>{c.text}</p></li>)}
          </ol>
        </Card>
        <Card title="今日计划" icon={ListChecks} actions={<span className="muted small">{memory.plan ? `第 ${memory.plan.day} 天` : '待生成'}</span>}>
          {memory.plan ? <ol className="plan-list">{memory.plan.items.map((t, i) => <li key={i}><span className="num">{String(i + 1).padStart(2, '0')}</span><p>{t}</p><span className={`tag ${memory.plan.tasks?.[i]?.status === 'done' ? 't-insight' : ''}`} title={memory.plan.tasks?.[i]?.evidence || '仅真实结果触发完成'}>{memory.plan.tasks?.[i]?.status === 'done' ? '已完成' : '待执行'}</span></li>)}</ol> : <div className="chart-empty">新的一天开始时，TA 会根据余额、饥饿和最近的洞见排好计划。</div>}
        </Card>
        <Card title="反思与洞见" icon={Lightbulb} actions={<span className="muted small num">已反思 {memory.reflections || 0} 次</span>}>
          <Meter label="反思压力（累计重要度 / 阈值）" value={(memory.pressure || 0) * 100} tone="soft" />
          {memory.insights?.length ? <ul className="insight-list">{memory.insights.slice().reverse().map((m, i) => <li key={i}><p>{m.text}</p>{m.evidence?.length > 0 && <small className="muted">证据：{m.evidence.join(' ｜ ')}</small>}</li>)}</ul> : <div className="chart-empty">重要的事积累到一定程度，TA 会停下来反思，提炼出洞见。</div>}
        </Card>
        <Card title="生活状态" icon={Gauge}>
          <Meter label="能量" value={world?.energy ?? 0} />
          <Meter label="心情" value={(world?.mood ?? 0) * 100} tone="soft" />
          <dl className="kv mt"><dt>目标</dt><dd>{persona.goal}</dd><dt>技能</dt><dd>{persona.skills.join(' · ')}</dd><dt>价值观</dt><dd>{persona.values.join(' · ')}</dd></dl>
        </Card>
      </div>
      <div className="col">
        <Card title="长期记忆" icon={Archive} className="grow" pad={false}>
          {memory.long.length ? (
            <ul className="mem-list">{memory.long.slice().reverse().map((m, i) => <li key={i} style={{ opacity: 0.35 + 0.65 * (m.strength ?? 1) }} title={`记忆强度 ${Math.round((m.strength ?? 1) * 100)}%（艾宾浩斯遗忘）`}><span className={`tag t-${m.tag}`}>{TAG[m.tag] || m.tag}</span><p>{m.text}</p><time className="num">{m.clock || new Date(m.at).toLocaleTimeString('zh-CN', { hour12: false })}{(m.strength ?? 1) < 0.5 && <em className="fade-tag">渐淡</em>}</time></li>)}</ul>
          ) : <div className="chart-empty">还没有长期记忆。智能体写日记或被拒绝支出后会在这里沉淀。</div>}
        </Card>
        <Card title="记忆检索" icon={ScanSearch} pad={false} actions={<span className="muted small">得分 = 新近度 + 重要度 + 1.5 × 相关度</span>}>
          {memory.retrieval?.length ? <table className="retr"><thead><tr><th>记忆</th><th>新近</th><th>重要</th><th>相关</th><th>得分</th></tr></thead><tbody>{memory.retrieval.map((r, i) => <tr key={i}><td title={r.text}>{r.text.slice(0, 34)}</td><td className="num">{r.recency.toFixed(2)}</td><td className="num">{r.importance.toFixed(2)}</td><td className="num">{r.relevance.toFixed(2)}</td><td className="num strong">{r.score.toFixed(2)}</td></tr>)}</tbody></table> : <div className="chart-empty">每 5 步按当前目标检索一次相关记忆。</div>}
        </Card>
        <Card title="短期记忆" icon={Clock} className="grow" pad={false}>
          <ul className="mem-list short">{memory.short.slice(-14).reverse().map((m, i) => <li key={i}><span className="tag">{KIND[m.kind] || m.kind}</span><p>{m.text}</p></li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
