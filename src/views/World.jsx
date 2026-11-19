import React, { useState } from 'react';
import { Monitor, Hand, Send, Gauge, Pause, Play, StepForward, Info, MonitorSmartphone, ArrowRight } from 'lucide-react';
import { Card, IconButton } from '../components/ui.jsx';
import ScreenView from '../components/ScreenView.jsx';
import ActivityList from './ActivityList.jsx';

export default function World({ s, c, godMode, setView }) {
  const [cmd, setCmd] = useState('');
  const send = () => { if (cmd) { c('inject', cmd); setCmd(''); } };
  return (
    <div className="view world">
      <Card title="任务板世界" icon={Monitor} className="w-feed" actions={<span className="muted small">{s.desktop?.active ? '已让位于智能体桌面' : (s.worldKind === 'sim' ? '模拟世界 · 1280×800' : 'QEMU · VNC')}</span>}>
        {s.desktop?.active && <div className="notice dk-world-note"><MonitorSmartphone size={14} /><span>{s.persona.name} 现在正以第一人称操作「{s.desktop.target?.name}」。任务板世界已暂停推进 —— 生活发生在智能体桌面里。</span><button className="ghost sm" onClick={() => setView?.('desktop')}>打开智能体桌面<ArrowRight size={13} /></button></div>}
        <ScreenView world={s.world} persona={s.persona} takeover={s.takeover && godMode} onHumanAct={(a) => c('humanAct', a)} />
      </Card>
      <div className="w-side">
        <Card title="干预控制" icon={Hand}>
          {!godMode && <div className="notice"><Info size={14} />当前为只读观察。开启右上角 God Mode 后才能干预这个世界。</div>}
          <div className="btnrow">
            {s.paused ? <IconButton icon={Play} label="继续" disabled={!godMode} onClick={() => c('resume')} /> : <IconButton icon={Pause} label="暂停" disabled={!godMode} onClick={() => c('pause')} />}
            <IconButton icon={StepForward} label="单步" disabled={!godMode} onClick={() => c('step')} />
            <IconButton icon={Hand} label={s.takeover ? '交还控制' : '接管'} tone={s.takeover ? 'danger' : ''} active={s.takeover} disabled={!godMode} onClick={() => c('takeover', !s.takeover)} />
          </div>
          <label className="field-l">注入指令（下一步生效）</label>
          <div className="inputrow">
            <input disabled={!godMode} placeholder="例如：今天优先做翻译类任务" value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="primary icon" disabled={!godMode || !cmd} onClick={send}><Send size={14} /></button>
          </div>
          <label className="field-l"><Gauge size={13} />节奏 <span className="num muted">{(s.tickMs / 1000).toFixed(1)}s / 步</span></label>
          <input type="range" className="range" disabled={!godMode} min="300" max="4000" step="100" value={s.tickMs} onChange={(e) => c('speed', +e.target.value)} />
        </Card>
        <Card title="思考与动作" className="grow" pad={false}>
          <ActivityList items={s.timeline.filter((e) => ['thought', 'action', 'result', 'human'].includes(e.kind))} limit={30} compact />
        </Card>
      </div>
    </div>
  );
}
