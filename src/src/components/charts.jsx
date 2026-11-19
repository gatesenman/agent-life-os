import React, { useId, useRef, useState, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
const draw = { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { pathLength: { duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }, opacity: { duration: 0.2 } } };

// 测量容器宽度，按真实像素绘制（避免拉伸变形）
export function useWidth() {
  const ref = useRef(null); const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth))); ro.observe(el); setW(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// 平滑曲线路径（Catmull-Rom → Bezier）
function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function AreaChart({ data, height = 180, format = (v) => v.toFixed(0) }) {
  const id = useId().replace(/:/g, '');
  const [ref, W] = useWidth();
  const H = height, P = { l: 44, r: 14, t: 14, b: 24 };
  if (data.length < 2) return <div ref={ref} className="chart-empty" style={{ height }}>数据积累中，智能体完成第一笔交易后显示走势</div>;
  const ys = data.map((d) => d.y), max = Math.max(...ys) * 1.1 || 1, min = Math.min(0, ...ys);
  const x = (i) => P.l + (i / (data.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b);
  const pts = data.map((d, i) => [x(i), y(d.y)]);
  const line = smooth(pts);
  const ticks = [0, 0.5, 1].map((f) => min + f * (max - min));
  const last = pts[pts.length - 1];
  return (
    <div ref={ref} className="chart-wrap" style={{ height }}>
      {W > 0 && (
        <svg width={W} height={H} className="chart">
          <defs>
            <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.26" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" /><text x={P.l - 10} y={y(t) + 3.5} className="axis" textAnchor="end">{format(t)}</text></g>
          ))}
          <motion.path d={`${line} L${last[0]},${H - P.b} L${P.l},${H - P.b} Z`} fill={`url(#g${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }} />
          <motion.path key={`l${data.length > 1 ? 'on' : 'off'}`} d={line} className="line" {...draw} />
          <motion.circle cx={last[0]} cy={last[1]} r="4" className="pt" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.5 }} />
          {[0, data.length - 1].map((i) => <text key={i} x={x(i)} y={H - 6} className="axis" textAnchor={i ? 'end' : 'start'}>{data[i].label}</text>)}
        </svg>
      )}
    </div>
  );
}

// 多条曲线对比（平行世界余额）
export function MultiLine({ series, height = 200, format = (v) => `$${v.toFixed(0)}`, xLabels = ['第 1 笔流水', '最新'] }) {
  const [ref, W] = useWidth();
  const H = height, P = { l: 44, r: 14, t: 14, b: 24 };
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) return <div ref={ref} className="chart-empty" style={{ height }}>数据积累中</div>;
  const n = Math.max(...series.map((s) => s.values.length));
  const max = Math.max(...all) * 1.1 || 1, min = Math.min(0, ...all);
  const x = (i) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b);
  return (
    <div ref={ref} className="chart-wrap" style={{ height }}>
      {W > 0 && (
        <svg width={W} height={H} className="chart">
          {[0, 0.5, 1].map((f, i) => { const t = min + f * (max - min); return <g key={i}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" /><text x={P.l - 10} y={y(t) + 3.5} className="axis" textAnchor="end">{format(t)}</text></g>; })}
          {series.map((s) => {
            if (s.values.length < 2) return null;
            const pts = s.values.map((v, i) => [x(i), y(v)]);
            const lp = pts[pts.length - 1];
            return (
              <g key={s.name}>
                <motion.path d={smooth(pts)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 5' : undefined} {...draw} />
                <motion.circle cx={lp[0]} cy={lp[1]} r="4" fill="var(--bg)" stroke={s.color} strokeWidth="2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 }} />
              </g>
            );
          })}
          <text x={P.l} y={H - 6} className="axis">{xLabels[0]}</text><text x={W - P.r} y={H - 6} className="axis" textAnchor="end">{xLabels[1]}</text>
        </svg>
      )}
    </div>
  );
}

export function BarChart({ data, height = 160 }) {
  const [ref, W] = useWidth();
  const H = height, P = { l: 10, r: 10, t: 10, b: 24 };
  if (!data.length) return <div ref={ref} className="chart-empty" style={{ height }}>暂无收支记录</div>;
  const max = Math.max(1, ...data.flatMap((d) => [d.in, d.out]));
  const bw = Math.min(64, (W - P.l - P.r) / data.length);
  const h = (v) => (v / max) * (H - P.t - P.b);
  return (
    <div ref={ref} className="chart-wrap" style={{ height }}>
      {W > 0 && (
        <svg width={W} height={H} className="chart">
          <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} className="grid" />
          {data.map((d, i) => {
            const x0 = P.l + i * bw + bw * 0.2, w = Math.max(3, (bw * 0.6) / 2 - 1);
            return (
              <g key={i}>
                <motion.rect x={x0} width={w} rx="3" className="bar-in" initial={{ height: 0, y: H - P.b }} animate={{ height: h(d.in), y: H - P.b - h(d.in) }} transition={{ type: 'tween', duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: i * 0.03 }} />
                <motion.rect x={x0 + w + 2} width={w} rx="3" className="bar-out" initial={{ height: 0, y: H - P.b }} animate={{ height: Math.max(d.out ? 2 : 0, h(d.out)), y: H - P.b - Math.max(d.out ? 2 : 0, h(d.out)) }} transition={{ type: 'tween', duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: i * 0.03 + 0.05 }} />
                {(data.length <= 10 || i % Math.ceil(data.length / 10) === 0) && <text x={x0 + w} y={H - 6} className="axis" textAnchor="middle">{d.label}</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function Radar({ values, size = 240 }) {
  const keys = Object.keys(values), n = keys.length, c = size / 2, r = size / 2 - 34;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v]; };
  const poly = keys.map((k, i) => pt(i, values[k].v).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar">
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={keys.map((_, i) => pt(i, f).join(',')).join(' ')} className="grid" />)}
      {keys.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={c} y1={c} x2={x} y2={y} className="grid" />; })}
      <motion.polygon points={poly} className="area" style={{ transformOrigin: `${c}px ${c}px` }} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.1 }} />
      {keys.map((k, i) => { const [x, y] = pt(i, values[k].v); return <circle key={k} cx={x} cy={y} r="2.5" className="pt" />; })}
      {keys.map((k, i) => { const [x, y] = pt(i, 1.2); return <text key={k} x={x} y={y + 3} textAnchor="middle" className="axis">{values[k].label}</text>; })}
    </svg>
  );
}

export function Ring({ value, max, size = 120, label, sub }) {
  const r = size / 2 - 8, C = 2 * Math.PI * r, f = Math.min(1, value / (max || 1));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} className={`ring-fg ${f > 0.85 ? 'warn' : ''}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.001, f) }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} />
      </svg>
      <div className="ring-c"><b>{label}</b><span>{sub}</span></div>
    </div>
  );
}

export function Sparkline({ values, height = 28, color }) {
  if (values.length < 2) return <svg className="spark" style={{ height }} />;
  const W = 120, max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, height - 2 - ((v - min) / (max - min || 1)) * (height - 4)]);
  return <svg viewBox={`0 0 ${W} ${height}`} className="spark" preserveAspectRatio="none" style={{ height }}><motion.path d={smooth(pts)} style={color ? { stroke: color } : undefined} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }} /></svg>;
}

export function balanceSeries(ledger) {
  let b = 0;
  return ledger.map((t, i) => ({ y: (b += t.amount), label: t.clock ? t.clock.replace('第', 'D').replace('天 ', ' ') : i === 0 ? '开始' : '' }));
}
export function flowByDay(ledger) {
  const m = new Map();
  for (const t of ledger) {
    if (t.type === 'fund') continue;
    const k = t.clock ? t.clock.slice(0, t.clock.indexOf(' ') + 3) : '—';
    const e = m.get(k) || { label: k.replace('第', 'D').replace('天 ', ' ') + 'h', in: 0, out: 0 };
    t.amount >= 0 ? (e.in += t.amount) : (e.out += -t.amount);
    m.set(k, e);
  }
  return [...m.values()].slice(-16);
}
