import React, { useState } from 'react';
import { Search, Activity as ActIcon, Timer, ShieldCheck, Cpu, GitBranch } from 'lucide-react';
import { Sparkline } from '../components/charts.jsx';
import { Card, Segmented } from '../components/ui.jsx';
import ActivityList from './ActivityList.jsx';
export default function Activity({ s }) {
  const [f, setF] = useState('all'); const [q, setQ] = useState('');
  return (
    <div className="view single">
      {s.trace && <Trace t={s.trace} />}
      <Card title="活动时间线" pad={false} className="grow" actions={
        <div className="toolbar">
          <Segmented id="act" value={f} onChange={setF} options={[['all', '全部'], ['thought', '思考'], ['action', '动作'], ['money', '收支'], ['life', '生命'], ['human', '干预'], ['system', '系统']]} />
          <div className="search"><Search size={14} /><input placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>}>
        <ActivityList items={s.timeline} filter={f} query={q} />
      </Card>
    </div>
  );
}

const SRC = { rules: '规则策略', llm: '视觉/语言模型', 'llm-error': '模型出错回退', none: '等待配置', held: '守护者接管', plan: '计划', reflection: '反思' };
function Trace({ t }) {
  const total = Object.values(t.sources).reduce((a, b) => a + b, 0) || 1;
  return (
    <Card title="运行可观测性" icon={ActIcon} actions={<span className="muted small num">最近 {t.n} 步</span>}>
      <div className="obs-grid">
        <div className="obs-kpi"><span><Timer size={12} strokeWidth={1.75} />单步耗时</span><b className="num">{t.p50} ms</b><small className="num">P95 {t.p95} ms</small><Sparkline values={t.series} height={26} /></div>
        <div className="obs-kpi"><span><ShieldCheck size={12} strokeWidth={1.75} />定律检查</span><b className="num">{t.lawChecks}</b><small className="num">违反 {t.violations} 次（L1–L18 每步全检）</small></div>
        <div className="obs-kpi"><span><Cpu size={12} strokeWidth={1.75} />动作校验</span><b className="num">{t.verifyRate == null ? '—' : t.verifyRate + '%'}</b><small className="num">事件 {t.events} 条</small></div>
        <div className="obs-kpi"><span><GitBranch size={12} strokeWidth={1.75} />决策来源</span><div className="obs-src">{Object.entries(t.sources).map(([k, v]) => <i key={k} style={{ flex: v }} title={`${SRC[k] || k} ${v} 步`} className={`src-${k}`} />)}</div><small>{Object.entries(t.sources).map(([k, v]) => `${SRC[k] || k} ${Math.round(v / total * 100)}%`).join(' · ')}</small></div>
      </div>
      <table className="retr obs-table"><thead><tr><th>步</th><th>世界时间</th><th>动作</th><th>来源</th><th>校验</th><th>事件</th><th>耗时</th></tr></thead>
        <tbody>{t.recent.map((x) => <tr key={x.step}><td className="num">{x.step}</td><td className="num">{x.clock}</td><td title={x.action}>{x.action || '—'}</td><td>{SRC[x.source] || x.source}</td><td>{x.verify == null ? '—' : x.verify ? '通过' : '未通过'}</td><td className="num">{x.events}</td><td className="num">{x.ms} ms</td></tr>)}</tbody></table>
    </Card>
  );
}
