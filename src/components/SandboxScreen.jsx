import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, BadgeCheck, BatteryMedium, Bell, Bike, BookOpen, Briefcase, CheckCircle2, Code2, Command, CookingPot, Globe, Headphones, Hourglass, Lock, Mail, MapPin, Minus,
  NotebookPen, PackageCheck, PenTool, Plus, RotateCcw, RotateCw, Salad, Search, ShieldCheck, ShoppingBag, Soup, UtensilsCrossed, Wifi, XCircle, Circle, MousePointer2, Keyboard, Moon,
} from 'lucide-react';

// 内置沙盒桌面渲染器：直接绘制智能体做命中测试用的同一份“显示列表”，观察者看到的就是智能体操作的像素
const ICONS = { ArrowLeft, BadgeCheck, BatteryMedium, Bell, Bike, BookOpen, Briefcase, CheckCircle2, Code2, Command, CookingPot, Globe, Headphones, Hourglass, Lock, Mail, MapPin, Minus, NotebookPen, PackageCheck, PenTool, Plus, RotateCcw, RotateCw, Salad, Search, ShieldCheck, ShoppingBag, Soup, UtensilsCrossed, Wifi, XCircle };
const Ico = ({ name, size = 16, ...p }) => { const I = ICONS[name] || Circle; return <I size={size} strokeWidth={1.75} {...p} />; };
const box = (n) => ({ left: n.x, top: n.y, width: n.w, height: n.h });

// 打字机效果：值变长时逐字显现
function TypeValue({ value = '', placeholder, animate = true }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current; prev.current = value;
    if (reduce || !animate || !value.startsWith(from) || value.length - from.length < 2) { setShown(value); return; }
    const chars = [...value]; let i = [...from].length; setShown(from);
    const per = Math.max(12, Math.min(60, 900 / (chars.length - i)));
    const t = setInterval(() => { i++; setShown(chars.slice(0, i).join('')); if (i >= chars.length) clearInterval(t); }, per);
    return () => clearInterval(t);
  }, [value, reduce]);
  return shown ? <span className="sx-val">{shown}</span> : <span className="sx-ph">{placeholder}</span>;
}

function Node({ n, focusInput }) {
  const st = box(n); const hue = n.hue ?? 240;
  switch (n.k) {
    case 'wall': return <div className="sx-wall" style={st} />;
    case 'rect': return <div className="sx-rect" style={{ ...st, background: n.fill }} />;
    case 'icon': return <div className="sx-icon" style={{ ...st, color: n.color }}><Ico name={n.icon} size={Math.min(n.w, n.h)} /></div>;
    case 'text': return <div className={`sx-text ${n.align === 'right' ? 'r' : ''}`} style={{ ...st, fontSize: n.size || 13, fontWeight: n.weight || 400, color: n.color }}>{n.icon && <Ico name={n.icon} size={13} />}{n.label}</div>;
    case 'deskicon': return <div className="sx-deskicon" style={st}><div className="sx-di-ico"><Ico name={n.icon} size={26} /></div><span>{n.label}</span></div>;
    case 'window': return <div className={`sx-window ${n.focused ? 'focused' : ''}`} style={st} />;
    case 'dot': return <div className="sx-dot" style={{ ...st, background: n.fill }} />;
    case 'tab': return <div className="sx-tab" style={st}><Ico name={n.icon} size={13} /><span>{n.label}</span></div>;
    case 'btn': return <div className={`sx-btn ${n.variant || ''} ${n.disabled ? 'disabled' : ''}`} style={st}>{n.icon && <Ico name={n.icon} size={n.variant === 'icon' ? 15 : 14} />}{n.variant !== 'icon' && n.variant !== 'round' && n.variant !== 'roundghost' && <span>{n.label}</span>}</div>;
    case 'input': return <div className={`sx-input ${n.role === 'address' ? 'addr' : ''} ${focusInput === n.inputId ? 'focus' : ''}`} style={st}>{n.icon && <Ico name={n.icon} size={12} />}<TypeValue value={n.value} placeholder={n.placeholder} animate={focusInput === n.inputId} />{focusInput === n.inputId && <i className="sx-caret" />}</div>;
    case 'textarea': return <div className={`sx-textarea ${focusInput === n.inputId ? 'focus' : ''}`} style={st}><TypeValue value={n.value} placeholder={n.placeholder} animate={focusInput === n.inputId} />{focusInput === n.inputId && <i className="sx-caret" />}</div>;
    case 'page': return <div className="sx-page" style={st} />;
    case 'tile': return <div className="sx-tile" style={st}><Ico name={n.icon} size={26} /><b>{n.label}</b><small>{n.sub}</small></div>;
    case 'card': return <div className="sx-card" style={{ ...st, '--h': hue }}><div className="sx-card-art"><Ico name={n.icon} size={30} /></div><div className="sx-card-t"><b>{n.label}</b><small>{n.sub}</small></div></div>;
    case 'dish': return <div className="sx-dish" style={{ ...st, '--h': hue }}><div className="sx-dish-art"><Ico name={n.icon} size={22} /></div><div className="sx-dish-t"><b>{n.label}</b><small>{n.sub}</small></div><span className="sx-price">{n.price}</span>{n.count > 0 && <span className="sx-count">{n.count}</span>}</div>;
    case 'product': return <div className="sx-product" style={st}><div className="sx-prod-art"><Ico name={n.icon} size={34} /></div><b>{n.label}</b><small>{n.sub}</small><span className="sx-price">{n.price}</span></div>;
    case 'job': return <div className="sx-job" style={st}><div className="sx-job-ico"><Briefcase size={18} strokeWidth={1.75} /></div><div className="sx-dish-t"><b>{n.label}</b><small>{n.sub}</small></div><span className="sx-price pos">{n.price}</span></div>;
    case 'mailrow': return <div className={`sx-mailrow ${n.unread ? 'unread' : ''}`} style={st}><i /><b>{n.label}</b><small>{n.sub}</small></div>;
    case 'para': return <div className="sx-para" style={st}>{n.label}</div>;
    case 'cartbar': return <div className="sx-cartbar" style={st}><ShoppingBag size={16} strokeWidth={1.75} /><b>{n.label}</b><small>{n.sub}</small></div>;
    case 'row': return <div className={`sx-row ${n.strong ? 'strong' : ''}`} style={st}>{n.icon && <Ico name={n.icon} size={14} />}<div className="sx-dish-t"><b>{n.label}</b>{n.sub && <small>{n.sub}</small>}</div>{n.right && <span className="sx-price">{n.right}</span>}</div>;
    case 'status': return <div className={`sx-status ${n.tone || ''}`} style={st}><Ico name={n.icon} size={26} /><div><b>{n.label}</b><small>{n.sub}</small></div></div>;
    case 'dock': return <div className="sx-dock" style={st} />;
    case 'dockicon': return <div className="sx-dockicon" style={st}><Ico name={n.icon} size={22} />{n.running && <i />}</div>;
    case 'toast': return <motion.div className="sx-toast" style={st} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}><Ico name={n.icon} size={18} /><div><b>{n.label}</b><small>{n.sub}</small></div></motion.div>;
    case 'away': return <motion.div className="sx-away" style={st} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Moon size={30} strokeWidth={1.5} /><span>{n.label}</span></motion.div>;
    default: return null;
  }
}

// 屏幕舞台：自适应缩放 + 光标轨迹 + 点击涟漪 + 键入浮层 + 接管输入
export default function SandboxScreen({ screen, image, action, interactive = false, onInput, live = true }) {
  const wrap = useRef(null); const [scale, setScale] = useState(0.5);
  const W = screen?.width || 1280, H = screen?.height || 800;
  useLayoutEffect(() => {
    if (!wrap.current) return; const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / W)); ro.observe(wrap.current); return () => ro.disconnect();
  }, [W]);
  const reduce = useReducedMotion();
  const cursor = screen?.cursor || { x: W / 2, y: H / 2 };
  const [trail, setTrail] = useState([]); const [ripples, setRipples] = useState([]); const [keys, setKeys] = useState(null);
  const lastId = useRef(null);
  useEffect(() => {
    setTrail((t) => { const l = t[t.length - 1]; if (l && l.x === cursor.x && l.y === cursor.y) return t; return [...t, { x: cursor.x, y: cursor.y, t: Date.now() }].slice(-8); });
  }, [cursor.x, cursor.y]);
  useEffect(() => {
    if (!action || action.id === lastId.current) return; lastId.current = action.id; const a = action.action || {};
    if ((a.type === 'click' || a.type === 'double_click') && a.x != null) { const r = { id: action.id, x: a.x, y: a.y, d: a.type === 'double_click' }; setRipples((x) => [...x, r]); setTimeout(() => setRipples((x) => x.filter((y) => y.id !== r.id)), 900); }
    if (a.type === 'type' || a.type === 'key') { setKeys({ id: action.id, kind: a.type, text: a.type === 'type' ? a.text : a.keys }); }
  }, [action?.id]);
  useEffect(() => { if (!keys) return; const t = setTimeout(() => setKeys(null), 2600); return () => clearTimeout(t); }, [keys?.id]);
  const fresh = trail.filter((p) => Date.now() - p.t < 3000);

  const pt = (e) => { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.round(((e.clientX - r.left) / r.width) * W), y: Math.round(((e.clientY - r.top) / r.height) * H) }; };
  const handlers = interactive ? {
    tabIndex: 0,
    onClick: (e) => { e.currentTarget.focus(); onInput?.({ type: 'click', ...pt(e) }); },
    onDoubleClick: (e) => onInput?.({ type: 'double_click', ...pt(e) }),
    onWheel: (e) => onInput?.({ type: 'scroll', ...pt(e), dy: Math.round(e.deltaY) }),
    onKeyDown: (e) => {
      if (e.metaKey || e.ctrlKey) { if (e.key.length === 1) { e.preventDefault(); onInput?.({ type: 'key', keys: `ctrl+${e.key.toLowerCase()}` }); } return; }
      if (e.key.length === 1) { e.preventDefault(); onInput?.({ type: 'type', text: e.key }); return; }
      const map = { Enter: 'Enter', Backspace: 'BackSpace', Tab: 'Tab', Escape: 'Escape', Delete: 'Delete', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
      if (map[e.key]) { e.preventDefault(); onInput?.({ type: 'key', keys: map[e.key] }); }
    },
  } : {};

  return (
    <div className={`sx-wrap ${interactive ? 'interactive' : ''}`} ref={wrap} style={{ aspectRatio: `${W} / ${H}` }} {...handlers} aria-label={interactive ? '已接管：点击、滚动或键入以操作这台电脑' : '智能体的电脑屏幕'} role="img">
      <div className="sx-stage" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {image ? <img className="sx-frame" src={image} alt="VNC 画面" draggable={false} /> : screen?.nodes?.map((n) => <Node key={n.id} n={n} focusInput={screen.focusInput} />)}
        {!image && !screen?.nodes && <div className="sx-empty">还没有画面</div>}
        <svg className="sx-trail" width={W} height={H} aria-hidden>
          {!reduce && fresh.length > 1 && fresh.slice(1).map((p, i) => { const q = fresh[i]; return <line key={p.t + ':' + i} x1={q.x} y1={q.y} x2={p.x} y2={p.y} style={{ opacity: ((i + 1) / fresh.length) * 0.75 }} />; })}
        </svg>
        <AnimatePresence>
          {ripples.map((r) => (
            <motion.div key={r.id} className="sx-ripple" style={{ left: r.x, top: r.y }} initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: r.d ? 2.6 : 2, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0.01 : 0.75, ease: 'easeOut' }} />
          ))}
        </AnimatePresence>
        <motion.div className="sx-cursor" initial={false} animate={{ x: cursor.x, y: cursor.y }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: live ? 140 : 400, damping: 22, mass: 0.9 }}>
          <MousePointer2 size={22} strokeWidth={1.5} />
        </motion.div>
        <AnimatePresence>
          {keys && (
            <motion.div key={keys.id} className="sx-keys" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
              <Keyboard size={18} strokeWidth={1.75} />{keys.kind === 'key' ? keys.text.split('+').map((k) => <kbd key={k}>{k}</kbd>) : <span>{keys.text.length > 48 ? keys.text.slice(0, 48) + '…' : keys.text}</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
