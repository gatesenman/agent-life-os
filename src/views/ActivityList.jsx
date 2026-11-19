import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { softSpring } from '../components/motion.jsx';
import { Lightbulb, MousePointerClick, CornerDownRight, Eye, CircleDollarSign, Receipt, Cog, AlertTriangle, HeartPulse } from 'lucide-react';
const META = {
  thought: [Lightbulb, '思考'], action: [MousePointerClick, '动作'], result: [CornerDownRight, '结果'], human: [Eye, '干预'],
  money: [CircleDollarSign, '收支'], payment: [Receipt, '支付'], system: [Cog, '系统'], error: [AlertTriangle, '错误'], life: [HeartPulse, '生命'],
};
export default function ActivityList({ items, limit = 200, compact, filter = 'all', query = '' }) {
  const list = items.filter((e) => (filter === 'all' || e.kind === filter || (filter === 'money' && e.kind === 'payment')) && (!query || e.text.includes(query)))
    .slice(-limit).reverse();
  const mounted = useRef(false);
  useEffect(() => { const t = setTimeout(() => { mounted.current = true; }, 600); return () => clearTimeout(t); }, []);
  if (!list.length) return <div className="chart-empty">还没有活动。<br /><span className="muted small">当 TA 思考、点击、收款或申请支出时，会出现在这里。</span></div>;
  return (
    <ol className={`activity ${compact ? 'compact' : ''}`}>
      <AnimatePresence>
      {list.map((e, idx) => { const [I, label] = META[e.kind] || [Cog, e.kind]; return (
        <motion.li key={e.id} className={`act k-${e.kind}`}
          initial={mounted.current ? { opacity: 0, y: -8, backgroundColor: 'rgba(139,141,255,0.12)' } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(139,141,255,0)' }}
          transition={mounted.current ? { duration: 0.26, ease: [0.2, 0.7, 0.2, 1], backgroundColor: { duration: 1.2 } } : { ...softSpring, delay: Math.min(idx, 14) * 0.03 }}>
          <span className="act-ic"><I size={13} strokeWidth={1.75} /></span>
          <div className="act-body">
            <div className="act-text">{e.text}</div>
            <div className="act-meta"><span>{label}</span><span className="num">{e.clock}</span>{e.source && <span>{e.source === 'llm' ? 'LLM' : '规则'}</span>}</div>
          </div>
        </motion.li>
      ); })}
      </AnimatePresence>
    </ol>
  );
}
