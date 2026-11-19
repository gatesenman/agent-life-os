import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Landmark, Rocket, Atom, Users, Hourglass, Leaf, Thermometer, Bug, Waves, Flame, Scale, Languages, Handshake, Coins, BookOpen, Sparkles, ShieldAlert, Info, HeartPulse, Dna, Brain, Trees, Lock, Zap, CloudLightning, Sun, Sprout, Ban, Layers, TrendingUp, Activity } from 'lucide-react';
import { Card, Stat, Meter, Segmented, MButton, Badge } from '../components/ui.jsx';
import { MultiLine } from '../components/charts.jsx';
import { AnimatedNumber, spring } from '../components/motion.jsx';

const api = typeof window !== 'undefined' ? window.alos : null;
let metaCache = null;
const DIM_ICON = { HeartPulse, Dna, Brain, Users, Coins, Landmark, Trees, Hourglass };
const EV_ICON = { tech: Atom, era: Rocket, disaster: Waves, epidemic: Bug, conflict: Flame, collapse: ShieldAlert, bounty: Sprout, insight: Sparkles, peace: Handshake, place: Layers };
const GOD = [['plague', '降下瘟疫', Bug], ['disaster', '降下天灾', CloudLightning], ['bounty', '风调雨顺', Sun], ['insight', '赐予灵感', Sparkles], ['peace', '调停冲突', Handshake]];
const tabV = (x) => ({ hidden: { opacity: 0, x }, show: { opacity: 1, x: 0, transition: spring }, exit: { opacity: 0, x: -x, transition: { duration: 0.12 } } });

function Kardashev({ K }) {
  const R = 86, C = Math.PI * R, v = Math.max(0, Math.min(1, K));
  const marks = [[0, '0'], [0.5, '0.5'], [0.73, '地球今日约 0.73'], [1, 'I 型']];
  return (
    <div className="kd">
      <svg viewBox="-34 -8 288 136" role="img" aria-label="卡尔达肖夫等级">
        <path d="M24,112 A86,86 0 0 1 196,112" className="kd-bg" />
        <motion.path d="M24,112 A86,86 0 0 1 196,112" className="kd-fg" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - v) }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} />
        {marks.map(([m, l]) => { const a = Math.PI * (1 - m); const x = 110 + Math.cos(a) * 104, y = 112 - Math.sin(a) * 104; return <g key={l}><circle cx={110 + Math.cos(a) * 86} cy={112 - Math.sin(a) * 86} r={2.2} className="kd-tick" /><text x={x} y={y} className="kd-l" textAnchor={m < 0.4 ? "end" : m > 0.6 ? "start" : "middle"}>{l}</text></g>; })}
      </svg>
      <div className="kd-v num"><AnimatedNumber value={K} format={(x) => x.toFixed(3)} /></div>
    </div>
  );
}

function TechTree({ meta, civ }) {
  const un = new Set(civ.unlocked), next = new Set(civ.next.map((t) => t.id));
  const cols = meta.eras.map((e, i) => ({ era: e, techs: meta.techs.filter((t) => t.era === i) }));
  const nx = civ.next[0];
  return (
    <div className="ttree">
      {cols.map((c) => (
        <div key={c.era} className="tt-col"><div className="tt-era">{c.era}</div>
          {c.techs.map((t) => <motion.div key={t.id} layout className={`tt ${un.has(t.id) ? 'on' : next.has(t.id) ? 'next' : 'off'}`} title={`${t.desc}${t.req.length ? ` · 前置：${t.req.map((r) => meta.techs.find((x) => x.id === r)?.name).join('、')}` : ''}`} transition={spring}>
            {un.has(t.id) ? <Atom size={11} /> : next.has(t.id) ? <TrendingUp size={11} /> : <Lock size={11} />}<span>{t.name}</span></motion.div>)}
        </div>
      ))}
      {nx && <div className="tt-prog"><span>研究中：{nx.name}</span><div className="meter-track"><motion.div className="meter-fill accent" animate={{ width: `${Math.min(100, (civ.research / nx.cost) * 100)}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} /></div><span className="num muted">{civ.research} / {nx.cost}</span></div>}
    </div>
  );
}

function Laws({ L, c, godMode }) {
  const [draft, setDraft] = useState(L.config);
  useEffect(() => setDraft(L.config), [JSON.stringify(L.config)]);
  const spec = L.configSpec; const dirty = Object.keys(spec).some((k) => draft[k] !== L.config[k]);
  return (
    <div className="laws-grid">
      <Card title="世界法则" icon={Scale}>
        {!godMode && <div className="notice"><Info size={14} />修改世界法则属于干预，请先在右上角开启 God Mode。</div>}
        <div className="sliders">
          {Object.entries(spec).map(([k, sp]) => (
            <label key={k} className="slider"><span>{sp.zh}</span><input type="range" min={sp.min} max={sp.max} step={(sp.max - sp.min) / 100} value={draft[k]} disabled={!godMode} onChange={(e) => setDraft({ ...draft, [k]: +e.target.value })} /><b className="num">{(+draft[k]).toFixed(sp.max >= 10 ? 1 : 3)}</b></label>
          ))}
        </div>
        <p className="hint">法则改变的是规则 R，而不是状态 S：已经发生的历史不会被改写，新法则从下一刻起生效。文明起点（{{ primitive: '原始时代', agrarian: '农业时代', industrial: '工业时代', information: '信息时代' }[L.config.startEra] || L.config.startEra}）只在创世时决定。</p>
        <div className="btnrow end"><MButton className="ghost" disabled={!godMode || !dirty} onClick={() => setDraft(L.config)}>还原</MButton><MButton className="primary" disabled={!godMode || !dirty} onClick={() => c('lifeConfig', draft)}><Scale size={14} />应用法则</MButton></div>
      </Card>
      <Card title="天启" icon={Zap}>
        <p className="muted small mb">天启是人类输入 h(t)，同样必须遵守全部定律。</p>
        <div className="god-grid">
          {GOD.map(([k, label, I]) => <MButton key={k} className="ghost god-btn" disabled={!godMode || L.ended} onClick={() => c('godEvent', k)}><I size={16} /><span>{label}</span></MButton>)}
          <div className="god-btn forbidden" title="L8 必死律禁止"><Ban size={16} /><span>复活死者</span><em>被 L8 必死律禁止</em></div>
        </div>
      </Card>
    </div>
  );
}

export default function Civilization({ s, c, godMode, civTab: tab = 'civ', setCivTab: setTab }) {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => { if (!metaCache && api?.meta) api.meta().then((m) => { metaCache = m; setMeta(m); }); }, []);
  const L = s.life; if (!L || !meta) return <div className="view single"><Card title="文明与环境" icon={Landmark}><div className="chart-empty">载入中…</div></Card></div>;
  const H = L.history, civ = L.civ, env = L.env, econ = L.econ;
  const ser = (k) => H.map((h) => h[k]);
  const xl = [`纪元 ${Math.floor(L.history[0]?.year ?? 0)} 年`, `纪元 ${L.yearInt} 年`];
  const evs = (L.worldEvents || L.events).filter((e) => EV_ICON[e.type]).slice(-30).reverse();
  return (
    <div className="view civ">
      <div className="civ-head">
        <Segmented id="civtab" value={tab} onChange={setTab} options={[['civ', '文明'], ['env', '环境与生态'], ['dims', '维度体系'], ['laws', '世界法则']]} />
        <span className="muted small">{civ.era} · 纪元 {L.yearInt} 年 · 每位模拟居民代表 {L.config.populationScale.toLocaleString()} 人</span>
      </div>
      <motion.div key={tab} variants={tabV(12)} initial="hidden" animate="show" className="civ-body">
        {tab === 'civ' && (<>
          <div className="stats4">
            <Stat icon={Rocket} label="卡尔达肖夫指数" numeric={civ.K} format={(v) => v.toFixed(3)} sub={`功率 ${civ.power.toExponential(2)} W`} />
            <Stat icon={Atom} label="科技" numeric={civ.unlocked.length} sub={`/ ${meta.techs.length} 项 · ${civ.era}`} />
            <Stat icon={Scale} label="稳定度" numeric={civ.stability * 100} format={(v) => `${v.toFixed(0)}%`} tone={civ.stability < 0.3 ? 'warn' : ''} sub={`崩溃 ${L.counters.collapses} 次`} />
            <Stat icon={Users} label="人口" numeric={L.population} sub={`≈ ${(L.population * L.config.populationScale / 1e6).toFixed(1)} 百万人`} />
          </div>
          <div className="civ-row">
            <Card title="卡尔达肖夫等级" icon={Rocket} className="civ-kd"><Kardashev K={civ.K} /><p className="muted small">K = (log₁₀P − 6) / 10（Sagan 插值），P = 人口 × 代表倍数 × 人均能耗。只能由能耗计算得出（L15）。</p></Card>
            <Card title="科技树" icon={Atom} className="grow"><TechTree meta={meta} civ={civ} /></Card>
          </div>
          <div className="civ-row">
            <Card title="文化、语言与制度" icon={Landmark} className="grow">
              <div className="grid2"><Meter label="文化" value={civ.culture * 100} /><Meter label="制度与法律" value={civ.institutions * 100} /><Meter label="合作" value={civ.cooperation * 100} tone="soft" /><Meter label="稳定度" value={civ.stability * 100} tone="soft" /></div>
              <dl className="kv mt"><dt><Languages size={12} /> 方言数</dt><dd className="num">{civ.dialects.toFixed(1)}（印刷术、互联网使其趋同）</dd></dl>
            </Card>
            <Card title="经济（粮币）" icon={Coins} className="civ-econ">
              <dl className="kv"><dt>物价指数</dt><dd className="num">{econ.priceIndex.toFixed(3)}</dd><dt>通胀率</dt><dd className="num">{(econ.inflation * 100).toFixed(2)}% / 年</dd><dt>基尼系数</dt><dd className="num">{econ.gini.toFixed(3)}</dd><dt>人均财富</dt><dd className="num">{econ.meanWealth}</dd><dt>公库</dt><dd className="num">{econ.treasury.toFixed(1)}</dd><dt>账目</dt><dd className="num">创造 {econ.minted.toFixed(0)} − 消耗 {econ.destroyed.toFixed(0)}</dd></dl>
            </Card>
            <Card title="信念与宗族" icon={BookOpen} className="civ-bel">
              {Object.entries(L.beliefs).map(([k, v]) => <div key={k} className="cause"><span>{k}</span><div className="cause-bar"><motion.i animate={{ width: `${(v / Math.max(1, L.population)) * 100}%` }} transition={spring} /></div><b className="num">{v}</b></div>)}
              <div className="clans mt">{L.clans.map(([k, v]) => <Badge key={k}>{k}氏 {v}</Badge>)}</div>
            </Card>
          </div>
        </>)}
        {tab === 'env' && (<>
          <div className="stats4">
            <Stat icon={Thermometer} label="气候异常" numeric={env.anomaly} format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} °C`} tone={env.anomaly > 1.5 ? 'warn' : ''} />
            <Stat icon={Leaf} label="可再生资源" numeric={env.renewable} sub={`容量 ${Math.round(env.renewableCap)}`} />
            <Stat icon={Flame} label="不可再生资源" numeric={env.nonrenewable} sub="只减不增（L12）" />
            <Stat icon={Activity} label="熵" numeric={env.entropy} format={(v) => v.toFixed(2)} sub="永不减少（L11）" />
          </div>
          <div className="civ-row">
            <Card title="人口" icon={Users} className="grow"><MultiLine series={[{ name: '人口', color: '#8b8dff', values: ser('pop') }]} height={170} format={(v) => v.toFixed(0)} xLabels={xl} /></Card>
            <Card title="食物链（Lotka–Volterra）" icon={Bug} className="grow" actions={<div className="legend"><i style={{ background: '#6fd3a0' }} />草食动物<i style={{ background: '#ef8a8a' }} />捕食者</div>}><MultiLine series={[{ name: '草食动物', color: '#6fd3a0', values: ser('prey') }, { name: '捕食者', color: '#ef8a8a', values: ser('predators') }]} height={170} format={(v) => v.toFixed(0)} xLabels={xl} /></Card>
          </div>
          <div className="civ-row">
            <Card title="资源" icon={Leaf} className="grow" actions={<div className="legend"><i style={{ background: '#6fd3a0' }} />可再生<i style={{ background: '#e7b65c' }} />不可再生</div>}><MultiLine series={[{ name: '可再生', color: '#6fd3a0', values: ser('renewable') }, { name: '不可再生', color: '#e7b65c', values: ser('nonrenewable') }]} height={160} format={(v) => v.toFixed(0)} xLabels={xl} /></Card>
            <Card title="气候异常（°C）" icon={Thermometer} className="grow"><MultiLine series={[{ name: '气温', color: '#ef8a8a', values: ser('temp') }]} height={160} format={(v) => v.toFixed(1)} xLabels={xl} /></Card>
            <Card title="大事记" icon={Waves} className="civ-ev" pad={false}>{evs.length ? <ul className="lev">{evs.map((e) => { const I = EV_ICON[e.type]; return <li key={e.id}><I size={13} /><div><p>{e.text}</p><span className="num muted small">纪元 {Math.floor(e.year)} 年</span></div></li>; })}</ul> : <div className="chart-empty">暂无灾害、疫病或发明</div>}</Card>
          </div>
        </>)}
        {tab === 'dims' && (<>
          <div className="dims">
            {meta.dimensions.map((d, i) => { const I = DIM_ICON[d.icon] || Layers; return (
              <motion.div key={d.id} className="card dim" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.04 }}>
                <header className="card-h"><div className="card-t"><I size={15} /><span>{d.name}</span></div><span className="muted small">{d.subs.length} 个子维度</span></header>
                <div className="card-b"><p className="muted small mb">{d.summary}</p>
                  <ul className="dim-subs">{d.subs.map((x) => <li key={x.id}><b>{x.name}</b><span>{x.rule}</span><div>{x.laws.map((l) => <em key={l} title={meta.laws[l]?.text}>{l}</em>)}{x.config.map((k) => <i key={k}>可调：{L.configSpec[k]?.zh || k}</i>)}</div></li>)}</ul>
                </div>
              </motion.div>); })}
          </div>
          <Card title="定律（每一步自动校验）" icon={Scale}>
            <ul className="law-list">{Object.entries(meta.laws).map(([k, v]) => <li key={k} className={Number(k.slice(1)) >= 8 ? 'new' : ''}><em>{k}</em><b>{v.name}</b><span>{v.text}</span></li>)}</ul>
          </Card>
        </>)}
        {tab === 'laws' && <Laws L={L} c={c} godMode={godMode} />}
      </motion.div>
    </div>
  );
}
