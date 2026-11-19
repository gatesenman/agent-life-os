import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from './motion.jsx';

// 家谱：按代分行；子女位于父母下方中点；伴侣相邻并以横线相连；已故者虚线描边
export default function FamilyTree({ family, color = '#8b8dff', onPick, picked }) {
  const layout = useMemo(() => {
    const nodes = family?.nodes || []; const byId = new Map(nodes.map((n) => [n.id, n]));
    const gens = [...new Set(nodes.map((n) => n.gen))].sort((a, b) => a - b);
    const X = new Map(), GAP = 58, ROW = 92, pos = [];
    let maxW = 0;
    for (const [ri, g] of gens.entries()) {
      const row = nodes.filter((n) => n.gen === g);
      const key = (n) => { const ps = (n.parents || []).filter((p) => X.has(p)); if (ps.length) return ps.reduce((s, p) => s + X.get(p), 0) / ps.length; if (n.partner && byId.get(n.partner)) { const pp = byId.get(n.partner); const qs = (pp.parents || []).filter((p) => X.has(p)); if (qs.length) return qs.reduce((s, p) => s + X.get(p), 0) / qs.length + 0.5; if (X.has(pp.id)) return X.get(pp.id) + 1; } return null; };
      row.sort((a, b) => (key(a) ?? 1e9) - (key(b) ?? 1e9) || a.born - b.born);
      // 伴侣相邻
      const ordered = []; const seen = new Set();
      for (const n of row) { if (seen.has(n.id)) continue; ordered.push(n); seen.add(n.id); const p = n.partner && row.find((x) => x.id === n.partner); if (p && !seen.has(p.id)) { ordered.push(p); seen.add(p.id); } }
      let x = 0; const desired = ordered.map((n) => key(n));
      ordered.forEach((n, i) => { const want = desired[i]; x = i === 0 ? (want ?? 0) : Math.max(x + GAP, want ?? x + GAP); X.set(n.id, x); pos.push({ n, x, y: ri * ROW }); });
      maxW = Math.max(maxW, x);
    }
    const minX = Math.min(0, ...pos.map((p) => p.x));
    for (const p of pos) p.x = p.x - minX + 84;
    const P = new Map(pos.map((p) => [p.n.id, p]));
    const edges = [];
    for (const p of pos) {
      const ps = (p.n.parents || []).map((id) => P.get(id)).filter(Boolean);
      if (ps.length) { const mx = ps.reduce((s, q) => s + q.x, 0) / ps.length, my = ps[0].y; edges.push({ k: 'c' + p.n.id, d: `M${mx},${my + 16} C${mx},${my + 50} ${p.x},${p.y - 50} ${p.x},${p.y - 16}`, alive: p.n.alive }); }
      const q = p.n.partner && P.get(p.n.partner); if (q && q.x > p.x) edges.push({ k: 'u' + p.n.id, d: `M${p.x + 14},${p.y} L${q.x - 14},${q.y}`, partner: true });
    }
    return { pos, edges, w: maxW - minX + 130, h: gens.length * ROW + 40, gens };
  }, [family]);
  const [hover, setHover] = useState(null);
  if (!layout.pos.length) return <div className="chart-empty">家谱为空</div>;
  return (
    <div className="ftree">
      <svg width={Math.max(layout.w, 300)} height={layout.h} role="img" aria-label="家谱">
        {layout.gens.map((g, i) => <text key={g} x={6} y={i * 92 + 44} className="ft-gen">第 {g} 代</text>)}
        <g transform="translate(0,40)">
          {layout.edges.map((e) => <motion.path key={e.k} d={e.d} className={e.partner ? 'ft-u' : 'ft-e'} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }} />)}
          {layout.pos.map(({ n, x, y }, i) => (
            <motion.g key={n.id} className={`ft-n ${n.alive ? '' : 'dead'} ${n.focus ? 'focus' : ''} ${picked === n.id ? 'picked' : ''}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: n.alive ? 1 : 0.55, scale: 1, x, y }} transition={{ ...spring, delay: Math.min(i, 40) * 0.012 }}
              onClick={() => onPick?.(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              {n.focus && <circle r={21} className="ft-halo" style={{ stroke: color }} />}
              <circle r={15} className="ft-c" style={n.focus ? { stroke: color } : undefined} />
              <text className="ft-t" dy="4.5">{n.name.slice(0, 1)}</text>
              {n.mutations > 0 && <circle r={3} cx={11} cy={-11} className="ft-mut" />}
              <text className="ft-l" dy="30">{n.name.slice(1)}</text>
            </motion.g>
          ))}
        </g>
      </svg>
      {hover && <div className="ft-tip glass"><b>{hover.name}</b><span>{hover.alive ? `${hover.age} 岁 · ${hover.stage}` : `纪元 ${hover.born}–${hover.died} 年 · 享年 ${hover.age} 岁`}</span>{!hover.alive && <span>死因：{hover.cause}</span>}</div>}
    </div>
  );
}
