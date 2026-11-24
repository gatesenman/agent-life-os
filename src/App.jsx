import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, MotionConfig, LayoutGroup } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { stagger } from './components/motion.jsx';
import { TitleBar, Sidebar, ApprovalStack } from './components/Chrome.jsx';
import Onboarding from './components/Onboarding.jsx';
import NewAgentDialog from './components/NewAgentDialog.jsx';
import Overview from './views/Overview.jsx';
import World from './views/World.jsx';
import Activity from './views/Activity.jsx';
import Memory from './views/Memory.jsx';
import Wallet from './views/Wallet.jsx';
import Identity from './views/Identity.jsx';
import Multiverse from './views/Multiverse.jsx';
import Settings from './views/Settings.jsx';
import Life from './views/Life.jsx';
import Civilization from './views/Civilization.jsx';
import Mirror from './views/Mirror.jsx';
import Desktop from './views/Desktop.jsx';
import Genesis from './views/Genesis.jsx';

import { useDialogAccessibility } from './components/useDialogAccessibility.js';

const api = typeof window !== 'undefined' ? window.alos : null;
const VIEWS = { overview: Overview, world: World, activity: Activity, memory: Memory, wallet: Wallet, identity: Identity, multiverse: Multiverse, settings: Settings, life: Life, civ: Civilization, mirror: Mirror, desktop: Desktop, genesis: Genesis };

export default function App() {
  useDialogAccessibility();
  const [data, setData] = useState(null);
  const [view, setView] = useState('overview');
  const [mvTab, setMvTab] = useState('tree');
  const [civTab, setCivTab] = useState('civ');
  const [mirrorMode, setMirrorMode] = useState('globe');
  const [godMode, setGodMode] = useState(false); // 观察者模式默认只读
  const [collapsed, setCollapsed] = useState(false);
  const [guide, setGuide] = useState(() => { try { return !localStorage.getItem('alos.onboarded'); } catch { return true; } });
  const [toast, setToast] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [replayId, setReplayId] = useState(null);

  const closeGuide = useCallback(() => { setGuide(false); try { localStorage.setItem('alos.onboarded', '1'); } catch {} }, []);
  const finishGuide = useCallback((dest) => { closeGuide(); if (dest === 'desktop') { setReplayId(null); setView('desktop'); } }, [closeGuide]);
  const needGod = useCallback(() => setToast('请先点右上角「只读观察」开启 God Mode，才能暂停、单步或接管'), []);
  useEffect(() => {
    // 供冒烟测试截图切换视图
    window.__alosNav = (v) => {
      if (v.startsWith('god-')) { setGodMode(true); v = v.slice(4); }
      if (v === 'mirror-place') { setGuide(false); setNewOpen(false); setMirrorMode('street'); setView('mirror'); setTimeout(() => window.dispatchEvent(new CustomEvent('alos-mirror-select', { detail: 'focus-place' })), 900); return; }
      if (v === 'onboarding') { setGuide(true); return; }
      if (v.startsWith('onboarding-')) { setGuide(Number(v.slice(11)) || true); return; }
      if (v === 'desktop-replay') { setGuide(false); setNewOpen(false); window.alos?.desktop('recordings').then((r) => { const x = (r.recordings || []).find((q) => /外卖/.test(q.goal)) || r.recordings?.[0]; setReplayId(x ? x.id + '#' + Date.now() : null); setView('desktop'); }); return; }
      if (v === 'newagent') { setGuide(false); setNewOpen(true); return; }
      setNewOpen(false);
      setGuide(false);
      if (v.startsWith('desktop')) { setReplayId('none#' + Date.now()); setView('desktop'); return; }
      if (v === 'compare') { setMvTab('compare'); setView('multiverse'); return; }
      if (v === 'multiverse') setMvTab('tree');
      if (v === 'mirror') setMirrorMode('globe');
      if (v === 'mirror-street') { setMirrorMode('street'); setView('mirror'); return; }
      if (v.startsWith('civ-')) { setCivTab(v.slice(4)); setView('civ'); return; }
      if (v === 'civ') setCivTab('civ');
      if (v === 'genesis' || v.startsWith('genesis-')) { setView('genesis'); return; }
      setView(v);
    };
    if (!api) return;
    api.getState().then((x) => x && setData(x));
    return api.onState((x) => x && setData(x));
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); }, [toast]);

  if (!api) return <div className="boot">请通过 Electron 启动本应用（npm start）。</div>;
  if (!data) return <div className="boot"><div className="spinner" />正在创世并孵化智能体…</div>;
  const s = data.world, mv = data.multiverse;
  const c = async (k, a) => { const r = await api.control(k, a); if (r?.error) setToast(r.error); else if (r) setData(r); return r; };
  const V = VIEWS[view];

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="shell"><a className="skip-link" href="#main-content">跳到主要内容</a>
          <Sidebar s={s} mv={mv} view={view} setView={setView} godMode={godMode} onNewAgent={() => { if (!godMode) needGod(); else setNewOpen(true); }} collapsed={collapsed} setCollapsed={setCollapsed} />
          <div className="main">
            <TitleBar s={s} mv={mv} view={view} godMode={godMode} setGodMode={setGodMode} c={c} onHelp={() => setGuide(true)} onNeedGod={needGod} />
            <main className="content" id="main-content" tabIndex={-1}>
              {/* 页面切换只做入场动画：AnimatePresence(popLayout) 的退出会被页内 layoutId 元素卡住，
                  透明的旧页面叠在新页面上挡住点击并持续累积（v0.4.2 端到端测试发现），故不再保留退出动画 */}
                <motion.div key={view} className="view-wrap"
                  initial={{ opacity: 0, y: 14, scale: 0.992, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
                  <motion.div className="view-inner" variants={stagger} initial="hidden" animate="show">
                    <V s={s} mv={mv} c={c} godMode={godMode} setView={setView} tab={mvTab} setTab={setMvTab} civTab={civTab} setCivTab={setCivTab} mirrorMode={mirrorMode} setMirrorMode={setMirrorMode} setGodMode={setGodMode} replayId={replayId} />
                  </motion.div>
                </motion.div>
            </main>
          </div>
          <ApprovalStack approvals={view === 'wallet' ? [] : mv.approvals} c={c} onOpenAll={() => setView('wallet')} worlds={mv.worlds}
            onOpenDesktop={async (ap) => { if (ap.worldId && ap.worldId !== mv.activeId) await c('switch', ap.worldId); setView('desktop'); }} />
          <AnimatePresence>
            {toast && (
              <motion.div className="toast" role="alert" initial={{ opacity: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 380, damping: 28 }}>
                <AlertTriangle size={15} /><span>{toast}</span><button className="link" onClick={() => setToast(null)} aria-label="关闭"><X size={14} /></button>
              </motion.div>
            )}
          </AnimatePresence>
          <Onboarding open={!!guide} start={typeof guide === 'number' ? guide : 0} onClose={closeGuide} onFinish={finishGuide} />
          <NewAgentDialog open={newOpen} onClose={() => setNewOpen(false)} worldCount={mv.worlds.length} onCreate={async (seed) => { const r = await api.newAgent(seed); if (r) { setData(r); setView('desktop'); } }} />
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
