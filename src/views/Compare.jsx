import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { HeartPulse, Columns2, LineChart, GitCompareArrows, Dna, Lightbulb, MousePointerClick, CircleDollarSign, Eye, Cog, CornerDownRight, Receipt, AlertTriangle } from 'lucide-react';
import { Card, Meter, money } from '../components/ui.jsx';
import { MultiLine } from '../components/charts.jsx';
import { AnimatedNumber, spring } from '../components/motion.jsx';

import { alignPopulation, eventKey } from '../lib/comparison.mjs';

const ICON = { thought: Lightbulb, action: MousePointerClick, result: CornerDownRight, money: CircleDollarSign, payment: Receipt, human: Eye, system: Cog, error: AlertTriangle };
const G = { openness: '开放', conscientiousness: '尽责', extraversion: '外向', agreeableness: '宜人', neuroticism: '敏感', risk_tolerance: '冒险', frugality: '节俭', curiosity: '好奇' };

function Picker({ mv, value, onChange, exclude }) {
  return (
    <div className="picker">
      {mv.worlds.map((w) => (
        <button key={w.worldId} className={value === w.worldId ? 'on' : ''} disabled={w.worldId === exclude} onClick={() => onChange(w.worldId)}>
          {value === w.worldId && <motion.span layoutId={`pick-${exclude}`} className="seg-pill" transition={spring} />}
          <i className="wdot" style={{ background: w.color }} /><span className="seg-label">{w.name}</span>
        </button>
      ))}
    </div>
  );
}

function Delta({ a, b, fmt = (v) => v.toFixed(2), better = 'up' }) {
  const d = b - a; if (Math.abs(d) < 1e-9) return <span className="delta same">持平</span>;
  const good = better === 'up' ? d > 0 : d < 0;
  return <span className={`delta ${good ? 'good' : 'bad'}`}>{d > 0 ? '+' : '−'}{fmt(Math.abs(d))}</span>;
}

export default function Compare({ mv }) {
  const [A, setA] = useState(mv.activeId);
  const [B, setB] = useState(mv.worlds.find((w) => w.worldId !== mv.activeId)?.worldId);
  useEffect(() => { const aId = mv.worlds.some((w) => w.worldId === A) ? A : mv.activeId; if (aId !== A) setA(aId); if (B === aId || !mv.worlds.some((w) => w.worldId === B)) setB(mv.worlds.find((w) => w.worldId !== aId)?.worldId); }, [A, B, mv.activeId, mv.worlds.map((w) => w.worldId).join(',')]);
  const a = mv.worlds.find((w) => w.worldId === A), b = mv.worlds.find((w) => w.worldId === B);
  if (!a || !b) return <div className="empty-card"><Columns2 size={20} /><b>至少需要两个世界才能对比</b><span>先在「分支图」里分叉一个平行世界。</span></div>;
  const rows = [
    ['余额', (w) => w.balance, money, 'up'], ['累计收入', (w) => w.stats.earned, money, 'up'], ['累计支出', (w) => w.stats.spent, money, 'down'],
    ['行动步数', (w) => w.steps, (v) => v.toFixed(0), 'up'], ['返工次数', (w) => w.stats.rejectedTasks, (v) => v.toFixed(0), 'down'],
  ];
  // 时间线差异：同序号同文本视为共同历史
  const keyOf = eventKey;
  const aligned = alignPopulation(a.life?.series, b.life?.series);
  const setA_ = new Set(a.recent.map(keyOf)), setB_ = new Set(b.recent.map(keyOf));
  const genomeDiff = Object.keys(a.genome).filter((k) => Math.abs(a.genome[k] - b.genome[k]) > 0.001);
  const Col = ({ w, other }) => (
    <ol className="diff">
      {w.recent.slice(-26).reverse().map((e) => { const shared = other.has(keyOf(e)); const I = ICON[e.kind] || Cog; return (
        <motion.li key={e.id} className={`${shared ? 'shared' : 'div'} k-${e.kind}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={spring} layout="position">
          <I size={12} /><span className="num">{e.clock}</span><p>{e.text}</p>{!shared && <em>分歧</em>}
        </motion.li>
      ); })}
    </ol>
  );
  return (
    <div className="compare">
      <div className="cmp-pick">
        <div><label className="field-l">世界 A</label><Picker mv={mv} value={A} onChange={setA} exclude={B} /></div>
        <GitCompareArrows size={18} className="muted" />
        <div><label className="field-l">世界 B</label><Picker mv={mv} value={B} onChange={setB} exclude={A} /></div>
      </div>
      <div className="notice"><GitCompareArrows size={14} /><span>当前状态差值不是因果结论。两侧时钟或规则不同，不能直接解释为某项干预的效果。人口图仅对齐共同纪元年；余额图按流水笔次排列。</span></div>
      <div className="cmp-grid">
        {[a, b].map((w, i) => (
          <motion.div key={w.worldId + i} layoutId={`world-${w.worldId}`} className="card cmp-card" transition={spring}>
            <header className="card-h"><div className="card-t"><i className="wdot" style={{ background: w.color }} /><span>{w.name}</span></div><span className="muted small num">{w.clock}</span></header>
            <div className="card-b">
              <div className="cmp-big num"><AnimatedNumber value={w.balance} format={money} /></div>
              <Meter label="能量" value={w.energy ?? 0} />
              <Meter label="心情" value={(w.mood ?? 0) * 100} tone="soft" />
              <dl className="kv">
                {rows.map(([label, f, fmt, better]) => (
                  <React.Fragment key={label}><dt>{label}</dt><dd className="num">{fmt(f(w))} {i === 1 && <Delta a={f(a)} b={f(b)} fmt={fmt} better={better} />}</dd></React.Fragment>
                ))}
                <dt>预算</dt><dd className="num">{money(w.policy.dailyCapUsd)}/天 · 每笔人工审批</dd>
              </dl>
            </div>
          </motion.div>
        ))}
      </div>
      {a.life && b.life && (
        <div className="cmp-row">
          <Card title="生命与文明" icon={HeartPulse} className="grow">
            <table className="table cmp-life"><thead><tr><th /><th><i className="wdot" style={{ background: a.color }} />{a.name}</th><th><i className="wdot" style={{ background: b.color }} />{b.name}</th></tr></thead>
              <tbody>{[
                ['纪元年', (w) => Math.floor(w.life.year)], ['在世人口', (w) => w.life.population], ['最高世代', (w) => `第 ${w.life.maxGen} 代`],
                ['主角', (w) => (w.life.focus ? `${w.life.focus.name} · ${w.life.focus.stage} ${w.life.focus.age} 岁` : '血脉断绝')], ['主角更替', (w) => `${w.life.successions} 次`],
                ['出生 / 死亡', (w) => `${w.life.births} / ${w.life.deaths}`], ['主要死因', (w) => Object.entries(w.life.causes).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, v]) => `${k} ${v}`).join('、') || '—'],
                ['时代', (w) => w.life.era], ['卡尔达肖夫', (w) => w.life.K.toFixed(3)], ['科技', (w) => `${w.life.techs} 项`], ['稳定度', (w) => `${Math.round(w.life.stability * 100)}%`],
                ['气候异常', (w) => `${w.life.temp >= 0 ? '+' : ''}${w.life.temp.toFixed(2)} °C`], ['基尼系数', (w) => w.life.gini.toFixed(3)], ['此刻天气', (w) => w.life.weather],
                ['法则', (w) => `疫病 ${w.life.config.diseaseRate} · 突变 ${w.life.config.mutationRate} · 灾害 ${w.life.config.disasterRate}`],
              ].map(([k, f]) => { const va = f(a), vb = f(b); return <tr key={k} className={String(va) !== String(vb) ? 'diffrow' : ''}><td className="muted">{k}</td><td className="num">{va}</td><td className="num">{vb}</td></tr>; })}</tbody></table>
          </Card>
          <Card title="人口走势对比" icon={LineChart} className="grow">
            {aligned ? <MultiLine series={[{ name: a.name, color: a.color, values: aligned.a }, { name: b.name, color: b.color, values: aligned.b }]} height={220} format={(v) => v.toFixed(0)} xLabels={[`纪元 ${aligned.start} 年`, `纪元 ${aligned.end} 年`]} /> : <div className="chart-empty">共同纪元年数据不足，暂不绘制误导性对比。</div>}
          </Card>
        </div>
      )}
      <div className="cmp-row">
        <Card title="余额走势对比" icon={LineChart} className="grow" actions={<span className="legend">{[a, b].map((w) => <React.Fragment key={w.worldId}><i style={{ background: w.color }} />{w.name}</React.Fragment>)}</span>}>
          <MultiLine series={[{ name: a.name, color: a.color, values: a.series }, { name: b.name, color: b.color, values: b.series, dashed: false }]} height={200} />
        </Card>
        <Card title="性格差异" icon={Dna} className="cmp-genome">
          {genomeDiff.length ? genomeDiff.map((k) => (
            <div key={k} className="gdiff"><span>{G[k] || k}</span><div className="gbar"><i style={{ left: `${a.genome[k] * 100}%`, background: a.color }} /><i style={{ left: `${b.genome[k] * 100}%`, background: b.color }} /></div><span className="num muted">{a.genome[k].toFixed(2)} / {b.genome[k].toFixed(2)}</span></div>
          )) : <div className="chart-empty">性格完全相同，差异仅来自分支种子与预算规则</div>}
        </Card>
      </div>
      <Card title="时间线差异" icon={GitCompareArrows} pad={false} actions={<span className="legend"><i className="lg-shared" />共同历史<i className="lg-div" />分歧</span>}>
        <div className="diff-grid"><Col w={a} other={setB_} /><Col w={b} other={setA_} /></div>
      </Card>
    </div>
  );
}
