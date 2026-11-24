import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from './motion.jsx';
import { AnimatedNumber } from './motion.jsx';
import {
  LayoutDashboard, Monitor, Activity, Brain, Wallet, Fingerprint, Settings2, Lock, LockOpen, Play, Pause, StepForward, Dna, ShieldCheck, Check, X, PanelLeftClose, PanelLeftOpen,
  GitBranch, ChevronDown, Zap, CircleHelp, HeartPulse, Landmark, Globe2, Hourglass, MonitorSmartphone, Utensils, Bike, ShoppingBag, Info, Orbit,
} from 'lucide-react';
import { Badge, money, MButton } from './ui.jsx';

// 信息架构：观察（核心体验）→ 生活 → 世界实验 → 系统
export const NAV_GROUPS = [
  { id: 'watch', label: '观察', items: [
    ['overview', '概览', LayoutDashboard],
    ['desktop', '智能体桌面', MonitorSmartphone],
    ['mirror', '镜像世界', Globe2],
    ['activity', '活动', Activity],
  ] },
  { id: 'life', label: '生活', items: [
    ['life', '生命与家族', HeartPulse],
    ['memory', '记忆', Brain],
    ['wallet', '收支与审批', Wallet],
    ['identity', '身份', Fingerprint],
  ] },
  { id: 'world', label: '世界', items: [
    ['genesis', '创世中心', Orbit],
    ['multiverse', '平行世界', GitBranch],
    ['civ', '文明与环境', Landmark],
    ['world', '任务板世界', Monitor],
  ] },
  { id: 'sys', label: '系统', items: [
    ['settings', '适配器与设置', Settings2],
  ] },
];
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

function WorldSwitcher({ mv, c }) {
  const [open, setOpen] = React.useState(false);
  const cur = mv.worlds.find((w) => w.worldId === mv.activeId);
  if (!cur) return null;
  return (
    <div className="wswitch nodrag">
      <MButton className="ghost wsbtn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <i className="wdot" style={{ background: cur.color }} /><span>{cur.name}</span>{mv.worlds.length > 1 && <span className="muted small">+{mv.worlds.length - 1}</span>}<ChevronDown size={13} />
      </MButton>
      <AnimatePresence>
        {open && (
          <>
            <div className="menu-scrim" onClick={() => setOpen(false)} />
            <motion.ul className="menu" role="listbox" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }} transition={spring}>
              <li className="menu-h">正在观察的世界</li>
              {mv.worlds.map((w) => (
                <li key={w.worldId} role="option" aria-selected={w.worldId === mv.activeId} className={w.worldId === mv.activeId ? 'on' : ''} onClick={() => { c('switch', w.worldId); setOpen(false); }}>
                  <i className="wdot" style={{ background: w.color }} /><span>{w.name}</span>
                  {w.desktop?.goal && <span className="muted small ws-goal">{w.desktop.goal}</span>}
                  <span className="num muted">{money(w.balance)}</span>
                  {w.approvals > 0 && <em className="count">{w.approvals}</em>}
                  {w.worldId === mv.activeId && <Check size={13} />}
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TitleBar({ s, mv, view, godMode, setGodMode, c, onHelp, onNeedGod }) {
  const label = NAV.find((n) => n[0] === view)?.[1];
  const status = s.takeover ? ['warn', '人工接管'] : s.paused ? ['warn', '已暂停'] : s.running ? ['live', '运行中'] : ['default', '待机'];
  const hunger = s.hunger ?? s.world?.hunger;
  const desk = s.desktop?.active;
  const needGod = (fn) => () => { if (!godMode) onNeedGod?.(); else fn(); };
  return (
    <div className="titlebar">
      <div className="crumbs"><span className="muted">{s.persona.name}</span><span className="sep">/</span><span>{label}</span></div>
      <WorldSwitcher mv={mv} c={c} />
      <div className="tb-center">
        <Badge tone={status[0]} dot>{status[1]}</Badge>
        {desk && <Badge tone="accent" title={s.desktop.target?.name}><MonitorSmartphone size={11} />{s.desktop.goal?.title || '操作电脑中'}</Badge>}
        <span className="tb-meta num">{s.world?.clock}</span>
        {hunger != null && <span className={`tb-meta num ${hunger >= 0.6 ? 'warn' : ''}`} title="饥饿：生理需求，≥60% 会去点外卖"><Utensils size={12} /> {Math.round(hunger * 100)}%</span>}
        {s.life && <span className="tb-meta num" title="纪元年：由世界时间按时间压缩推出"><Hourglass size={12} /> 纪元 {s.life.yearInt} 年</span>}
        <span className="tb-meta">第 {s.stats.steps} 步</span>
      </div>
      <div className="tb-right nodrag">
        <button className="tb-btn help" onClick={onHelp} title="新手引导" aria-label="新手引导"><CircleHelp size={15} /></button>
        <div className="tb-group">
          {s.paused ? <button className="tb-btn" disabled={!godMode} onClick={needGod(() => c('resume'))} title={godMode ? '继续' : '需开启 God Mode'} aria-label="继续"><Play size={14} /></button>
            : <button className="tb-btn" disabled={!godMode} onClick={needGod(() => c('pause'))} title={godMode ? '暂停' : '需开启 God Mode'} aria-label="暂停"><Pause size={14} /></button>}
          <button className="tb-btn" disabled={!godMode} onClick={needGod(() => c('step'))} title={godMode ? '单步' : '需开启 God Mode'} aria-label="单步"><StepForward size={14} /></button>
        </div>
        <MButton className={`lockbtn ${godMode ? 'open' : ''}`} onClick={() => setGodMode(!godMode)} aria-pressed={godMode} title={godMode ? '退回只读观察' : '开启后才能暂停、接管、分叉世界'}>
          {godMode ? <Zap size={14} /> : <Lock size={14} />}
          <span>{godMode ? 'God Mode' : '只读观察'}</span>
        </MButton>
      </div>
    </div>
  );
}

export function Sidebar({ s, mv, view, setView, godMode, onNewAgent, collapsed, setCollapsed }) {
  const fade = { initial: { opacity: 0, x: -4 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -4, transition: { duration: 0.1 } }, transition: { duration: 0.18 } };
  const deskLive = s.desktop?.active && s.running && !s.paused && !s.takeover;
  const deskPending = (s.desktop?.orders || []).some((o) => o.status === 'awaiting');
  return (
    <motion.aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} animate={{ width: collapsed ? 68 : 232 }} transition={spring} initial={false}>
      <div className="brand">
        <div className="logo"><Dna size={16} strokeWidth={2} /></div>
        <AnimatePresence initial={false}>{!collapsed && <motion.div key="b" {...fade}><b>Agent Life OS</b><span>观察舱</span></motion.div>}</AnimatePresence>
      </div>
      <div className="agent-chip">
        <div className="agent-av">{s.persona.name.slice(0, 1)}</div>
        <AnimatePresence initial={false}>{!collapsed && <motion.div key="m" className="agent-meta" {...fade}><b>{s.persona.name}</b><span>{s.meta.name} · {s.llm.enabled ? s.llm.model : '规则大脑'}</span></motion.div>}</AnimatePresence>
        <i className={`status-dot ${s.paused || s.takeover ? 'warn' : s.running ? 'live' : ''}`} />
      </div>
      <nav className="nav">
        {NAV_GROUPS.map((g) => (
          <div key={g.id} className="nav-group">
            <AnimatePresence initial={false}>{!collapsed && <motion.div key="h" className="nav-sec" {...fade}>{g.label}</motion.div>}</AnimatePresence>
            {g.items.map(([k, label, I]) => (
              <MButton key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)} title={label}>
                {view === k && <motion.span layoutId="nav-active" className="nav-active" transition={spring} />}
                <I size={16} strokeWidth={1.75} />
                <AnimatePresence initial={false}>{!collapsed && <motion.span key="l" className="nav-label" {...fade}>{label}</motion.span>}</AnimatePresence>
                {k === 'wallet' && mv.approvals.length > 0 && <motion.em className="count" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>{mv.approvals.length}</motion.em>}
                {k === 'desktop' && (deskLive || deskPending) && <em className={`count ${deskPending ? '' : 'live-dot'}`} title={deskPending ? '有订单等待你批准' : '正在操作电脑'}>{deskPending ? '!' : ''}</em>}
                {k === 'multiverse' && mv.worlds.length > 1 && <em className="count neutral">{mv.worlds.length}</em>}
              </MButton>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <AnimatePresence initial={false}>{!collapsed && (
          <motion.div key="f" className="side-foot-inner" {...fade}>
            <div className="side-balance"><span>钱包余额</span><b className="num"><AnimatedNumber value={s.adapters.payment.balance} format={money} /></b></div>
            <MButton className="ghost full" disabled={!godMode} onClick={onNewAgent} title={godMode ? '' : '开启 God Mode 后才能孵化新智能体'}><Dna size={14} />孵化新智能体</MButton>
            <div className="side-note"><ShieldCheck size={12} />账户与收益归操作者所有</div>
          </motion.div>
        )}</AnimatePresence>
        <MButton className="ghost collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? '展开侧栏' : '收起侧栏'}>
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </MButton>
      </div>
    </motion.aside>
  );
}

const MERCHANT_ICON = { '速达外卖': Bike, '优选商城': ShoppingBag, 'World Shop': ShoppingBag };

// 审批卡片：标明世界色点、是否来自电脑、跳转入口
export function ApprovalStack({ approvals, c, onOpenAll, onOpenDesktop, worlds = [] }) {
  const [top, ...rest] = approvals;
  if (!top) return null;
  const world = worlds.find((w) => w.worldId === top.worldId);
  const fromDesk = !!top.desktop;
  const MerchI = MERCHANT_ICON[top.merchant] || ShieldCheck;
  return (
    <div className="approvals" aria-live="polite">
      <AnimatePresence initial={false}>
        <motion.div key={top.id} layout className="approval"
          initial={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.18 } }} transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
          <div className="ap-head">
            <span className="ap-k"><span className="ap-pulse" /><i className="wdot" style={{ background: world?.color || '#8b8dff' }} />支出审批 · {top.worldName}</span>
            <span className="ap-amt num">{money(top.amount)}</span>
          </div>
          <div className="ap-memo"><MerchI size={14} strokeWidth={1.75} />{top.memo}</div>
          <div className="ap-sub">
            {fromDesk && <span className="ap-tag"><MonitorSmartphone size={11} />来自电脑</span>}
            <span>{top.merchant}</span>
            <span>·</span>
            <span>{top.reason}</span>
          </div>
          <div className="ap-hint"><Info size={12} />批准后才会扣款；拒绝后 TA 会记住这次教训</div>
          <div className="ap-btns">
            {fromDesk && onOpenDesktop && <button className="link ap-more" onClick={() => onOpenDesktop(top)}>去看 TA 点餐</button>}
            {rest.length > 0 && <button className="link ap-more" onClick={onOpenAll}>另有 {rest.length} 笔</button>}
            <MButton className="ghost" onClick={() => c('reject', top.id)}><X size={14} />拒绝</MButton>
            <MButton className="primary" onClick={() => c('approve', top.id)}><Check size={14} />批准</MButton>
          </div>
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {rest.slice(0, 2).map((a, i) => (
          <motion.div key={a.id} className="approval ghost-card" style={{ zIndex: -1 - i }} initial={{ opacity: 0 }} animate={{ opacity: 1 - (i + 1) * 0.3, y: (i + 1) * 7, scale: 1 - (i + 1) * 0.04 }} exit={{ opacity: 0 }} transition={spring} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ApprovalList({ approvals, c, worlds = [] }) {
  if (!approvals.length) return <div className="chart-empty">没有待审批的支出。<br /><span className="muted small">当 TA 在电脑里点外卖或在任务板商店买东西时，会出现在这里。批准前不会扣款。</span></div>;
  return (
    <ul className="aplist">
      <AnimatePresence initial={false}>
        {approvals.map((a) => {
          const world = worlds.find((w) => w.worldId === a.worldId);
          return (
            <motion.li key={a.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring}>
              <div className="apl-main">
                <b className="num">{money(a.amount)}</b>
                <span>{a.memo}</span>
                <span className="muted small"><i className="wdot" style={{ background: world?.color || '#8b8dff', display: 'inline-block', marginRight: 6 }} />{a.worldName} · {a.merchant}{a.desktop ? ' · 电脑' : ''}</span>
              </div>
              <div className="ap-btns"><MButton className="ghost" onClick={() => c('reject', a.id)}><X size={14} />拒绝</MButton><MButton className="primary" onClick={() => c('approve', a.id)}><Check size={14} />批准</MButton></div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
