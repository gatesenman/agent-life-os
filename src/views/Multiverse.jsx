import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, GitFork, Shuffle, Columns2, Play, Pause, Trash2, ArrowRightLeft, Info, Network, Layers } from 'lucide-react';
import { Card, Segmented, MButton, Badge, money } from '../components/ui.jsx';
import { Sparkline } from '../components/charts.jsx';
import { spring } from '../components/motion.jsx';
import Compare from './Compare.jsx';

// 分支树：横轴为步数，每个世界一条泳道，从父世界的分叉点引出
function BranchTree({ worlds, activeId, onSelect }) {
  const order = useMemo(() => {
    const kids = (pid) => worlds.filter((w) => w.parentId === pid);
    const out = []; const visit = (w, depth) => { out.push({ ...w, depth }); kids(w.worldId).forEach((k) => visit(k, depth + 1)); };
    worlds.filter((w) => !w.parentId || !worlds.some((x) => x.worldId === w.parentId)).forEach((r) => visit(r, 0));
    return out;
  }, [worlds]);
  const lane = Object.fromEntries(order.map((w, i) => [w.worldId, i]));
  const maxStep = Math.max(10, ...worlds.map((w) => w.steps));
  const LH = 58, L = 210, R = 70, W = 900, H = order.length * LH + 30;
  const x = (s) => L + (s / maxStep) * (W - L - R);
  const y = (i) => 26 + i * LH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tree" style={{ height: H }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={x(f * maxStep)} x2={x(f * maxStep)} y1={8} y2={H - 4} className="grid" /><text x={x(f * maxStep)} y={H - 2} className="axis" textAnchor="middle">{Math.round(f * maxStep)}</text></g>)}
      {order.map((w) => {
        const i = lane[w.worldId], yy = y(i), x0 = x(w.forkStep || 0), x1 = x(w.steps);
        const parentLane = w.parentId != null ? lane[w.parentId] : undefined;
        const active = w.worldId === activeId;
        return (
          <g key={w.worldId} className={`lane ${active ? 'active' : ''}`} onClick={() => onSelect(w.worldId)} style={{ cursor: 'pointer' }}>
            <rect x={0} y={yy - LH / 2 + 4} width={W} height={LH - 8} rx="10" className="lane-bg" />
            {parentLane !== undefined && (
              <motion.path d={`M${x0},${y(parentLane)} C${x0 + 26},${y(parentLane)} ${x0 - 4},${yy} ${x0 + 22},${yy}`} fill="none" stroke={w.color} strokeWidth="1.5" strokeOpacity="0.7"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }} />
            )}
            {parentLane !== undefined && <circle cx={x0} cy={y(parentLane)} r="4" fill="var(--bg)" stroke={w.color} strokeWidth="1.5" />}
            <motion.line x1={parentLane !== undefined ? x0 + 22 : x0} y1={yy} y2={yy} stroke={w.color} strokeWidth="2.5" strokeLinecap="round"
              initial={{ x2: x0 }} animate={{ x2: Math.max(x1, x0 + 22) }} transition={spring} />
            {w.snapshots.filter((s) => s.step >= (w.forkStep || 0)).map((s) => <circle key={s.step} cx={x(s.step)} cy={yy} r="1.6" fill="rgba(255,255,255,0.55)" />)}
            <motion.circle cy={yy} r={active ? 6 : 5} fill={w.color} initial={false} animate={{ cx: Math.max(x1, x0 + 22) }} transition={spring} />
            {w.running && !w.paused && <motion.circle cy={yy} r="6" fill="none" stroke={w.color} initial={{ cx: Math.max(x1, x0 + 22), opacity: 0.6, scale: 1 }} animate={{ cx: Math.max(x1, x0 + 22), opacity: 0, scale: 2.4 }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />}
            <text x={16 + w.depth * 12} y={yy - 3} className="lane-name">{w.name}</text>
            <text x={16 + w.depth * 12} y={yy + 13} className="axis">{w.parentId ? `自第 ${w.forkStep} 步分叉` : '创世'} · {w.steps} 步</text>
            <text x={W - 8} y={yy + 4} className="lane-bal" textAnchor="end">{money(w.balance)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Slider({ label, value, set, min = 0, max = 1, step = 0.05, fmt = (v) => v.toFixed(2), disabled }) {
  return <label className="slider"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => set(+e.target.value)} /><b className="num">{fmt(value)}</b></label>;
}

function ForkPanel({ mv, src, c, godMode, onDone }) {
  const snaps = src?.snapshots || [];
  const [at, setAt] = useState(src?.steps ?? 0);
  const [name, setName] = useState('');
  const [seed, setSeed] = useState(Math.random().toString(36).slice(2, 8));
  const [frugality, setFrug] = useState(src?.genome.frugality ?? 0.5);
  const [risk, setRisk] = useState(src?.genome.risk_tolerance ?? 0.5);
  const [cap, setCap] = useState(src?.policy.dailyCapUsd ?? 10);
  const [auto, setAuto] = useState(src?.policy.autoApproveBelowUsd ?? 0);
  const [disease, setDisease] = useState(src?.life?.config?.diseaseRate ?? 0.04);
  const [mutation, setMutation] = useState(src?.life?.config?.mutationRate ?? 0.02);
  const [disaster, setDisaster] = useState(src?.life?.config?.disasterRate ?? 0.02);
  const [busy, setBusy] = useState(false);
  if (!src) return null;
  const full = mv.worlds.length >= mv.max;
  const atLabel = at >= src.steps ? `当前（第 ${src.steps} 步）` : `第 ${at} 步快照`;
  const go = async () => {
    setBusy(true);
    const r = await c('fork', { fromId: src.worldId, atStep: at >= src.steps ? undefined : at, name: name || undefined, branchSeed: seed, genome: { frugality, risk_tolerance: risk }, policy: { dailyCapUsd: cap, autoApproveBelowUsd: auto }, life: { diseaseRate: disease, mutationRate: mutation, disasterRate: disaster } });
    setBusy(false); if (!r?.error) { setName(''); setSeed(Math.random().toString(36).slice(2, 8)); onDone?.(); }
  };
  return (
    <Card title={`分叉「${src.name}」`} icon={GitFork}>
      {!godMode && <div className="notice"><Info size={14} />分叉属于干预操作，请先在右上角开启 God Mode。</div>}
      <label className="field-l">分叉点 <span className="muted num">{atLabel}</span></label>
      <input type="range" className="range" disabled={!godMode} min={snaps[0]?.step ?? 0} max={src.steps} step={1} value={at} onChange={(e) => {
        const v = +e.target.value; const near = [...snaps.map((s) => s.step), src.steps].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), src.steps); setAt(near);
      }} />
      <div className="snapticks">{snaps.map((s) => <i key={s.step} style={{ left: `${(s.step / Math.max(1, src.steps)) * 100}%` }} />)}</div>
      <div className="grid2">
        <div><label className="field-l">分支名称</label><input disabled={!godMode} placeholder="例如：更节俭的自己" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="field-l">分支种子（决定命运的随机性）</label>
          <div className="inputrow tight"><input disabled={!godMode} className="mono" value={seed} onChange={(e) => setSeed(e.target.value)} /><MButton className="ghost" disabled={!godMode} onClick={() => setSeed(Math.random().toString(36).slice(2, 8))} title="随机"><Shuffle size={14} /></MButton></div>
        </div>
      </div>
      <div className="sliders">
        <Slider disabled={!godMode} label="节俭" value={frugality} set={setFrug} />
        <Slider disabled={!godMode} label="冒险" value={risk} set={setRisk} />
        <Slider disabled={!godMode} label="每日预算" value={cap} set={setCap} min={1} max={30} step={1} fmt={(v) => `$${v}`} />
        <Slider disabled={!godMode} label="自动批准阈值" value={auto} set={setAuto} min={0} max={10} step={0.5} fmt={(v) => (v ? `< $${v}` : '关闭')} />
        <Slider disabled={!godMode} label="疫病率" value={disease} set={setDisease} min={0} max={0.3} step={0.01} />
        <Slider disabled={!godMode} label="突变率" value={mutation} set={setMutation} min={0} max={0.2} step={0.01} />
        <Slider disabled={!godMode} label="灾害率" value={disaster} set={setDisaster} min={0} max={0.2} step={0.01} />
      </div>
      <p className="hint">分叉会复制该时刻的完整世界状态（时间、钱包、记忆、任务、人口与家谱、文明、环境、镜像地点），之后两个世界独立运行、互不影响，不会合并。分支种子留空则与原世界走完全相同的命运。</p>
      <div className="btnrow end">
        <MButton className="primary" disabled={!godMode || busy || full} onClick={go}><GitFork size={14} />{full ? `已达上限 ${mv.max} 个` : busy ? '正在分叉…' : '分叉平行世界'}</MButton>
      </div>
    </Card>
  );
}

const tabV = (dx) => ({ hidden: { opacity: 0, x: dx }, show: { opacity: 1, x: 0, transition: { ...spring, staggerChildren: 0.04 } }, exit: { opacity: 0, x: -dx, transition: { duration: 0.12 } } });

export default function Multiverse({ s, mv, c, godMode, tab, setTab }) {
  const [sel, setSel] = useState(mv.activeId);
  const src = mv.worlds.find((w) => w.worldId === sel) || mv.worlds[0];
  return (
    <div className="view mv">
      <div className="mv-head">
        <Segmented id="mvtab" value={tab} onChange={setTab} options={[['tree', '分支图'], ['compare', '并排对比']]} />
        <div className="toolbar">
          <span className="muted small">{mv.worlds.length} / {mv.max} 个世界并发运行</span>
          <MButton className="ghost" disabled={!godMode} onClick={() => c('pauseAll')}><Pause size={14} />全部暂停</MButton>
          <MButton className="ghost" disabled={!godMode} onClick={() => c('resumeAll')}><Play size={14} />全部继续</MButton>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {tab === 'tree' ? (
          <motion.div key="tree" className="mv-grid" variants={tabV(-12)} initial="hidden" animate="show" exit="exit">
            <div className="col">
              <Card title="多元宇宙分支图" icon={Network} actions={<span className="muted small">点击泳道选择世界</span>}>
                <BranchTree worlds={mv.worlds} activeId={sel} onSelect={setSel} />
              </Card>
              <Card title="世界列表" icon={Layers} pad={false}>
                <ul className="worlds">
                  {mv.worlds.map((w) => (
                    <motion.li key={w.worldId} layoutId={`world-${w.worldId}`} className={`${w.worldId === sel ? 'sel' : ''}`} onClick={() => setSel(w.worldId)} transition={spring}>
                      <i className="wdot" style={{ background: w.color }} />
                      <div className="w-name"><b>{w.name}</b><span>{w.parentId ? `分叉自 ${mv.worlds.find((p) => p.worldId === w.parentId)?.name ?? '已删除世界'} · 第 ${w.forkStep} 步` : '创世世界'}</span></div>
                      <Badge tone={w.paused ? 'warn' : w.running ? 'live' : 'default'} dot>{w.paused ? '暂停' : w.running ? '运行' : '待机'}</Badge>
                      <span className="num w-steps">{w.steps} 步</span>
                      <div className="w-spark"><Sparkline values={w.series} color={w.color} /></div>
                      <span className="num w-bal">{money(w.balance)}</span>
                      <div className="w-act" onClick={(e) => e.stopPropagation()}>
                        {w.worldId === mv.activeId ? <Badge tone="accent">正在观察</Badge> : <MButton className="ghost" onClick={() => c('switch', w.worldId)} title="切换到此世界"><ArrowRightLeft size={14} />观察</MButton>}
                        {w.worldId !== 'w0' && <MButton className="ghost danger-h" disabled={!godMode} onClick={() => c('remove', w.worldId)} title="删除分支"><Trash2 size={14} /></MButton>}
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </Card>
            </div>
            <div className="col">
              <ForkPanel key={src?.worldId} mv={mv} src={src} c={c} godMode={godMode} />
              {mv.worlds.length < 2 && (
                <div className="empty-card"><GitBranch size={20} /><b>还没有平行世界</b><span>开启 God Mode 后，在上方选择分叉点并点击「分叉平行世界」，即可让同一个人在另一种命运里继续生活。</span></div>
              )}
              {mv.worlds.length >= 2 && <MButton className="ghost full" onClick={() => setTab('compare')}><Columns2 size={14} />并排对比这些世界</MButton>}
            </div>
          </motion.div>
        ) : (
          <motion.div key="cmp" variants={tabV(12)} initial="hidden" animate="show" exit="exit">
            <Compare mv={mv} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
