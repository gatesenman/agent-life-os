import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { HeartPulse, Network, Dna, Brain, Smile, Frown, Siren, Flame, Skull, Baby, Crown, Hourglass, Users, Activity, Coins, BookOpen, Sparkles, Heart } from 'lucide-react';
import { Card, Stat, Meter, Badge } from '../components/ui.jsx';
import { AnimatedNumber, spring } from '../components/motion.jsx';
import FamilyTree from '../components/FamilyTree.jsx';
import TalkPanel from '../components/TalkPanel.jsx';

const STAGES = ['婴儿', '童年', '少年', '青年', '成年', '中年', '老年'];
const TRAIT = { openness: '开放', conscientiousness: '尽责', extraversion: '外向', agreeableness: '宜人', neuroticism: '敏感', risk_tolerance: '冒险', frugality: '节俭', curiosity: '好奇', vitality: '体质', intelligence: '智力' };
const NEEDS = [['self', '自我实现'], ['esteem', '尊重'], ['belong', '归属'], ['safety', '安全'], ['phys', '生理']];
const EVI = { birth: Baby, death: Skull, succession: Crown, union: Heart, extinct: Skull, genesis: Sparkles };

function Pyramid({ needs }) {
  const W = 240, H = 190, n = NEEDS.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pyramid" role="img" aria-label="需求层级">
      {NEEDS.map(([k, label], i) => {
        const y0 = (i / n) * H, y1 = ((i + 1) / n) * H - 3, w0 = (W * (i + 0.6)) / (n + 0.6), w1 = (W * (i + 1.6)) / (n + 0.6);
        const pts = `${(W - w0) / 2},${y0} ${(W + w0) / 2},${y0} ${(W + w1) / 2},${y1} ${(W - w1) / 2},${y1}`;
        const v = needs?.[k] ?? 0;
        return (
          <g key={k}>
            <polygon points={pts} className="py-bg" />
            <clipPath id={`py-${k}`}><motion.rect x={0} y={y0} height={y1 - y0} initial={{ width: 0 }} animate={{ width: W * v }} transition={{ type: 'spring', stiffness: 80, damping: 18, delay: i * 0.05 }} /></clipPath>
            <polygon points={pts} className="py-fg" clipPath={`url(#py-${k})`} style={{ opacity: 0.35 + v * 0.65 }} />
            <text x={W / 2} y={(y0 + y1) / 2 + 4} className="py-t">{label} {Math.round(v * 100)}%</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Life({ s, mv, setView, c }) {
  const L = s.life; const [pick, setPick] = useState(null);
  const world = mv.worlds.find((w) => w.worldId === mv.activeId);
  if (!L) return null;
  const f = L.focus; const node = pick && L.family.nodes.find((n) => n.id === pick.id);
  const stageIdx = f ? STAGES.indexOf(f.stage) : -1;
  const lifeEvents = L.events.filter((e) => ['birth', 'death', 'succession', 'union', 'extinct', 'genesis'].includes(e.type)).slice(-40).reverse();
  const causes = Object.entries(L.causes).sort((a, b) => b[1] - a[1]); const cmax = Math.max(1, ...causes.map((c) => c[1]));
  const gens = L.generations; const y0 = Math.min(...gens.map((g) => g.firstBorn)), y1 = Math.max(L.yearInt, 1);
  return (
    <div className="view life">
      <div className="stats4">
        <Stat icon={Hourglass} label="纪元年" numeric={L.yearInt} format={(v) => `${Math.round(v)} 年`} sub={`每世界日 ${L.config.yearsPerDay} 年`} />
        <Stat icon={Users} label="在世人口" numeric={L.population} sub={`出生 ${L.counters.births} · 死亡 ${L.counters.deaths}`} />
        <Stat icon={Network} label="世代" numeric={L.maxGen} format={(v) => `第 ${Math.round(v)} 代`} sub={`主角更替 ${L.counters.successions} 次`} />
        <Stat icon={Dna} label="累计突变" numeric={L.counters.mutations} sub={`突变率 ${L.config.mutationRate}`} />
      </div>
      <div className="life-row">
        <Card title="主角的一生" icon={HeartPulse} className="life-hero">
          {f ? (
            <>
              <div className="lh-top"><div className="lh-av" style={{ '--wc': world?.color }}>{f.name[0]}</div><div><div className="lh-name">{f.name}<Badge tone="accent">第 {f.gen} 代</Badge>{f.sick && <Badge tone="neg">{f.sick}</Badge>}</div><div className="muted small">{f.sex === 'F' ? '女' : '男'} · {f.age} 岁 · 生于纪元 {f.born} 年 · {f.belief}</div></div></div>
              <div className="stages" role="list">
                {STAGES.map((st, i) => <div key={st} role="listitem" className={`stg ${i < stageIdx ? 'past' : ''} ${i === stageIdx ? 'now' : ''}`}>{i === stageIdx && <motion.span layoutId="stage-pill" className="stg-pill" transition={spring} />}<span>{st}</span></div>)}
              </div>
              <div className="grid2 mt">
                <Meter label="健康" value={f.health * 100} /><Meter label="意义感" value={f.meaning * 100} tone="soft" />
                <Meter label="技能" value={f.skill * 100} tone="soft" /><Meter label="教育" value={f.education * 100} tone="soft" />
              </div>
              <dl className="kv mt"><dt>财富</dt><dd className="num"><Coins size={12} /> {f.wealth} 粮币（社会内部货币，与美元钱包分离）</dd><dt>声望</dt><dd className="num">{Math.round(f.reputation * 100)}</dd><dt>住处</dt><dd>{L.mirror.places.find((p) => p.id === f.home)?.name || '—'}</dd></dl>
            </>
          ) : <div className="empty-card"><Skull size={20} /><b>血脉断绝</b><span>这个世界已没有主角。你仍可以查看家谱与世代历史，或在平行世界里看看另一种结局。</span></div>}
        </Card>
        <Card title="需求层级" icon={Activity} className="life-needs">{f ? <Pyramid needs={f.needs} /> : <div className="chart-empty">—</div>}</Card>
        <Card title="情绪与心智" icon={Brain} className="life-emo">
          {f ? (<>
            <Meter label="喜悦" value={f.emo.joy * 100} /><Meter label="悲伤" value={f.emo.sadness * 100} tone="soft" /><Meter label="恐惧" value={f.emo.fear * 100} tone="soft" /><Meter label="愤怒" value={f.emo.anger * 100} tone="soft" />
            <div className="mood-row">{f.mood >= 0 ? <Smile size={14} /> : <Frown size={14} />}<span>心情</span><b className="num"><AnimatedNumber value={f.mood} format={(v) => v.toFixed(2)} /></b><span className="muted small">范围 −1 到 1</span></div>
          </>) : <div className="chart-empty">—</div>}
        </Card>
      </div>
      <div className="life-row">
        <Card title="家谱" icon={Network} className="life-tree" pad={false} actions={<span className="legend"><i style={{ background: world?.color }} />主角<i className="lg-dead" />已故（虚线）<i className="lg-mut" />带突变</span>}>
          <FamilyTree family={L.family} color={world?.color} onPick={setPick} picked={pick?.id} />
        </Card>
        <Card title={node ? node.name : '基因'} icon={Dna} className="life-genes">
          {node && <div className="insp-tags mb"><Badge>{node.alive ? node.stage : '已故'}</Badge><Badge>第 {node.gen} 代</Badge>{!node.alive && <Badge tone="neg">{node.cause}</Badge>}{node.focus && <Badge tone="accent">主角</Badge>}</div>}
          {node && <p className="muted small mb">{node.alive ? `${node.age} 岁，生于纪元 ${node.born} 年。` : `纪元 ${node.born}–${node.died} 年，享年 ${node.age} 岁。`}{node.mutations ? ` 携带 ${node.mutations} 处突变。` : ''}</p>}
          {f && !node && (
            <div className="alleles">
              {Object.keys(TRAIT).map((t) => { const [a, b] = f.alleles[t]; const ph = f.genome[t]; return (
                <div key={t} className="al-row"><span>{TRAIT[t]}</span><div className="al-bar"><motion.i className="al-ph" initial={{ width: 0 }} animate={{ width: `${ph * 100}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} /><i className="al-a" style={{ left: `${a * 100}%` }} /><i className="al-b" style={{ left: `${b * 100}%` }} /></div><b className="num">{ph.toFixed(2)}</b></div>); })}
              <p className="muted small mt">两个小点是来自父母的两条等位基因，条形是表型（均值加后天漂移）。点击家谱中的人可查看其生平。</p>
            </div>
          )}
          {node && <button className="link" onClick={() => setPick(null)}>返回主角基因</button>}
        </Card>
      </div>
      <TalkPanel s={s} c={typeof c === 'function' ? c : undefined} personId={pick?.id} onPerson={(id) => setPick(L.family.nodes.find((n) => n.id === id) || { id })} />
      <div className="life-row">
        <Card title="世代时间线" icon={Hourglass} className="grow">
          <div className="gen-tl">
            {gens.map((g) => { const left = ((g.firstBorn - y0) / Math.max(1, y1 - y0)) * 100; return (
              <div key={g.gen} className="gt-row"><span className="gt-l">第 {g.gen} 代</span>
                <div className="gt-track"><motion.div className="gt-bar" style={{ left: `${left}%` }} initial={{ width: 0 }} animate={{ width: `${Math.max(2, 100 - left)}%` }} transition={{ type: 'spring', stiffness: 70, damping: 18 }}><span className="gt-alive" style={{ width: `${(g.alive / g.total) * 100}%` }} /></motion.div></div>
                <span className="gt-n num">{g.total} 人 · 在世 {g.alive}{g.meanLifespan ? ` · 平均寿命 ${g.meanLifespan}` : ''} · 体质 {g.vitality}</span></div>); })}
            <div className="gt-axis num"><span>纪元 {y0} 年</span><span>纪元 {y1} 年</span></div>
          </div>
        </Card>
        <Card title="死因构成" icon={Skull} className="life-causes">
          {causes.length ? causes.map(([k, v]) => <div key={k} className="cause"><span>{k}</span><div className="cause-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${(v / cmax) * 100}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} /></div><b className="num">{v}</b></div>) : <div className="chart-empty">尚无人去世</div>}
        </Card>
        <Card title="家族大事" icon={BookOpen} className="life-events" pad={false}>
          <ul className="lev">{lifeEvents.map((e) => { const I = EVI[e.type] || Sparkles; return <li key={e.id} className={`lev-${e.type}`}><I size={13} /><div><p>{e.text}</p><span className="num muted small">纪元 {Math.floor(e.year)} 年</span></div></li>; })}</ul>
        </Card>
      </div>
    </div>
  );
}
