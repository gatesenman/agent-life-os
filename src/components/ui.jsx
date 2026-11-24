import React from 'react';
import { motion } from 'framer-motion';
import { nextOptionIndex } from '../lib/keyboard.mjs';
import { rise, spring, AnimatedNumber } from './motion.jsx';

export function Card({ title, icon: Icon, actions, children, className = '', pad = true }) {
  return (
    <motion.section layout="position" variants={rise} className={`card ${className}`} whileHover={{ borderColor: 'rgba(255,255,255,0.11)' }} transition={spring}>
      {(title || actions) && (
        <header className="card-h">
          <div className="card-t">{Icon && <Icon size={15} strokeWidth={1.75} />}<span>{title}</span></div>
          {actions && <div className="card-a">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'card-b' : 'card-b nopad'}>{children}</div>
    </motion.section>
  );
}

export function Stat({ label, value, sub, tone, icon: Icon, children, numeric, format }) {
  return (
    <motion.div className="stat" variants={rise} whileHover={{ y: -2, boxShadow: '0 0 0 1px rgba(139,141,255,0.22), 0 18px 40px -18px rgba(139,141,255,0.35)' }} transition={spring}>
      <div className="stat-l">{Icon && <Icon size={14} strokeWidth={1.75} />}{label}</div>
      <div className={`stat-v ${tone || ''}`}>{numeric !== undefined ? <AnimatedNumber value={numeric} format={format} /> : value}</div>
      {sub && <div className="stat-s">{sub}</div>}
      {children}
    </motion.div>
  );
}

export function Badge({ tone = 'default', children, dot }) {
  return <span className={`badge ${tone}`}>{dot && <i className="dot" />}{children}</span>;
}

export function Meter({ label, value, max = 100, tone = 'accent' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      <div className="meter-row"><span>{label}</span><span className="num">{Math.round(pct)}%</span></div>
      <div className="meter-track"><motion.div className={`meter-fill ${tone}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} /></div>
    </div>
  );
}

export function Segmented({ value, onChange, options, id = 'seg' }) {
  return (
    <div className="seg" role="group" aria-label="视图切换">
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} className={value === k ? 'on' : ''} onKeyDown={(e) => { const next = nextOptionIndex(options.findIndex(([x]) => x === k), e.key, options.length); if (next >= 0) { e.preventDefault(); onChange(options[next][0]); e.currentTarget.parentElement.querySelectorAll('button')[next]?.focus(); } }} onClick={() => onChange(k)}>
          {value === k && <motion.span layoutId={`${id}-pill`} className="seg-pill" transition={spring} />}
          <span className="seg-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

// 带按压/悬停微交互的按钮
export function MButton({ className = '', children, ...rest }) {
  return <motion.button aria-label={rest['aria-label'] || rest.title} className={className} whileHover={rest.disabled ? undefined : { scale: 1.02 }} whileTap={rest.disabled ? undefined : { scale: 0.96 }} transition={spring} {...rest}>{children}</motion.button>;
}

export function IconButton({ icon: Icon, label, onClick, disabled, tone, active }) {
  return (
    <MButton className={`ibtn ${tone || ''} ${active ? 'active' : ''}`} onClick={onClick} disabled={disabled} title={label}>
      <Icon size={15} strokeWidth={1.75} />{label && <span>{label}</span>}
    </MButton>
  );
}

export const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;
