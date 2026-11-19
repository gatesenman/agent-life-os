import React from 'react';
import { MousePointer2, Briefcase, Mail, ShoppingBag, Wallet, NotebookPen, Coffee } from 'lucide-react';
const DOCK_ICON = { jobs: Briefcase, mail: Mail, shop: ShoppingBag, wallet: Wallet, notes: NotebookPen };

// VM 实时画面：模拟世界按 1280x800 坐标渲染；QEMU 世界显示 QMP 截图
export default function ScreenView({ world, takeover, onHumanAct, persona }) {
  if (!world) return <div className="chart-empty">世界尚未启动</div>;
  if (world.kind === 'qemu') {
    return (
      <div className="vm-frame">
        {world.image ? <img src={world.image} className="qemu-img" alt="VM" /> : <div className="chart-empty">等待 VM 截图…</div>}
        {world.vncUrl && <div className="vm-caption">VNC WebSocket · {world.vncUrl}</div>}
      </div>
    );
  }
  const W = world.width, H = world.height;
  const pct = (v, d) => `${(v / d) * 100}%`;
  const act = (id) => takeover && onHumanAct({ type: 'click', target: id });
  return (
    <div className="vm-frame">
      <div className={`vm ${takeover ? 'takeover' : ''}`} style={{ aspectRatio: `${W}/${H}` }}>
        <div className="vm-menubar">
          <span className="vm-dots"><i /><i /><i /></span>
          <span className="vm-menutitle">{persona?.name} 的工作站</span>
          <span className="vm-menuclock num">{world.clock}</span>
        </div>
        <div className="vm-hud">
          <span>能量</span><div className="vm-bar"><i style={{ width: `${world.energy}%` }} /></div>
          <span>心情</span><div className="vm-bar mood"><i style={{ width: `${world.mood * 100}%` }} /></div>
        </div>
        <div className="vm-window" style={{ left: pct(270, W), top: pct(100, H), width: pct(740, W), height: pct(560, H) }}>
          <div className="vm-wtitle">{world.appName}</div>
          {world.openApp === 'wallet' && <div className="vm-hint">余额与流水请见「收支」页。所有支出需守护者批准。</div>}
          {world.openApp === 'notes' && <div className="vm-hint">{world.notes.map((n, i) => <div key={i}>{n.at} · {n.text}</div>)}</div>}
        </div>
        {world.elements.map((e) => {
          const kind = e.id.split(':')[0];
          if (kind === 'dock') return null;
          return (
            <div key={e.id} className={`vm-el k-${kind} ${takeover ? 'clickable' : ''}`} onClick={() => act(e.id)} title={e.id}
              style={{ left: pct(e.rect[0], W), top: pct(e.rect[1], H), width: pct(e.rect[2], W), height: pct(e.rect[3], H) }}>
              {kind === 'buy' && e.id.includes('coffee') && <Coffee size={12} />}{e.label}
            </div>
          );
        })}
        <div className="vm-dock" style={{ left: pct(28, W), top: pct(722, H), width: pct(560, W), height: pct(66, H) }} />
        {world.elements.filter((e) => e.id.startsWith('dock:')).map((e) => {
          const app = e.id.split(':')[1]; const I = DOCK_ICON[app];
          return (
            <div key={e.id} className={`vm-dockitem ${world.openApp === app ? 'on' : ''} ${takeover ? 'clickable' : ''}`} onClick={() => act(e.id)} title={e.label}
              style={{ left: pct(e.rect[0], W), top: pct(e.rect[1], H), width: pct(e.rect[2], W), height: pct(e.rect[3], H) }}>
              <I size={15} strokeWidth={1.75} /><span>{e.label}</span>
            </div>
          );
        })}
        {world.lastClick && <div key={world.lastClick.at} className="ripple" style={{ left: pct(world.lastClick.x, W), top: pct(world.lastClick.y, H) }} />}
        <div className="cursor" style={{ left: pct(world.cursor.x, W), top: pct(world.cursor.y, H) }}><MousePointer2 size={18} fill="#fff" strokeWidth={1.5} /></div>
        {takeover && <div className="takeover-banner">人工接管中 · 点击画面元素进行操作</div>}
      </div>
    </div>
  );
}
