import React from 'react';
import { motion } from 'framer-motion';
import {
  Monitor, Activity, Wallet, TrendingUp, TrendingDown, Gauge, Footprints, Sparkles, MonitorSmartphone,
  ArrowRight, Utensils, Zap, Target, Radio, ShieldCheck, MapPin, Bike,
} from 'lucide-react';
import { Card, Stat, Meter, money, MButton, Badge } from '../components/ui.jsx';
import { Sparkline, balanceSeries } from '../components/charts.jsx';
import { rise } from '../components/motion.jsx';
import ScreenView from '../components/ScreenView.jsx';
import ActivityList from './ActivityList.jsx';
import Avatar3D from '../components/Avatar3D.jsx';
import SandboxScreen from '../components/SandboxScreen.jsx';

// 计划步骤较多时（外卖有 9 步）只显示当前步前后共 5 步，避免右栏卡片互相挤压重叠
const planWindow = (plan) => { if (plan.length <= 5) return plan; const a = Math.max(0, plan.findIndex((x) => x.status === 'active')); const from = Math.min(Math.max(0, a - 2), plan.length - 5); return plan.slice(from, from + 5); };

export default function Overview({ s, mv, setView }) {
  const p = s.adapters.payment;
  const series = balanceSeries(p.ledger).map((d) => d.y);
  const d = s.desktop;
  const deskOn = !!d?.active;
  const hunger = s.hunger ?? s.world?.hunger ?? 0;
  const energy = s.world?.energy ?? 0;
  const goal = d?.goal;
  const pending = mv.approvals.filter((a) => a.worldId === s.meta.worldId);
  const homeId = s.life?.focus?.home;
  const placeName = homeId && (s.life?.mirror?.places || []).find((x) => x.id === homeId)?.name;
  const order = (d?.orders || []).slice().reverse().find((o) => o.status === 'awaiting' || o.status === 'paid' || o.status === 'delivered');

  return (
    <div className="view overview">
      {/* 核心叙事条：TA 现在在做什么 → 一键去看 */}
      <motion.div className="ov-hero" variants={rise}>
        <div className="ov-hero-l">
          <div className="ov-hero-av"><Avatar3D appearance={s.dna.appearance} seed={s.dna.seed} height={72} preset="portrait" interactive={false} /></div>
          <div className="ov-hero-copy">
            <div className="ov-hero-k">{deskOn ? <><Radio size={12} className={s.running && !s.paused ? 'spin-soft' : ''} />第一人称 · {d.target?.name}</> : <><Monitor size={12} />任务板世界</>}</div>
            <b>{goal ? goal.title : deskOn ? `${s.persona.name} 正在用电脑生活` : `${s.persona.name} 在任务板上找工作`}</b>
            <span className="muted">{goal ? `因为${goal.why}` : deskOn ? '饿了会点外卖，钱少了会接零工 —— 付款前一定问你' : '绑定「智能体桌面」后，你能看到 TA 自己操作电脑的全过程'}</span>
          </div>
        </div>
        <div className="ov-hero-m">
          <div className="ov-meter"><Utensils size={13} /><span>饥饿</span><b className={`num ${hunger >= 0.6 ? 'warn' : ''}`}>{Math.round(hunger * 100)}%</b>
            <div className="meter-track"><div className={`meter-fill ${hunger >= 0.6 ? 'warn' : 'accent'}`} style={{ width: `${Math.round(hunger * 100)}%` }} /></div>
          </div>
          <div className="ov-meter"><Zap size={13} /><span>能量</span><b className="num">{Math.round(energy)}</b>
            <div className="meter-track"><div className={`meter-fill ${energy < 22 ? 'warn' : 'pos'}`} style={{ width: `${Math.round(energy)}%` }} /></div>
          </div>
          <div className="ov-meter"><Wallet size={13} /><span>余额</span><b className="num">{money(p.balance)}</b></div>
        </div>
        <div className="ov-hero-r">
          <MButton className="primary" onClick={() => setView(deskOn ? 'desktop' : 'desktop')}>
            <MonitorSmartphone size={15} />{deskOn ? '打开智能体桌面' : '去绑定电脑'}<ArrowRight size={14} />
          </MButton>
          {pending.length > 0 && <MButton className="ghost" onClick={() => setView('wallet')}><ShieldCheck size={14} />{pending.length} 笔待你批准</MButton>}
          {placeName && <button className="link ov-place" onClick={() => setView('mirror')}><MapPin size={12} />{placeName}</button>}
        </div>
      </motion.div>

      <div className="stats4">
        <Stat icon={Wallet} label="余额" numeric={p.balance} format={money}><Sparkline values={series} /></Stat>
        <Stat icon={TrendingUp} label="累计收入" numeric={s.stats.earned} format={money} tone="pos" sub={`${p.ledger.filter((t) => t.type === 'earn').length} 笔`} />
        <Stat icon={TrendingDown} label="累计支出" numeric={s.stats.spent} format={money} sub={`今日 ${money(s.policy.spentToday)} / ${money(s.policy.dailyCapUsd)}`} />
        <Stat icon={Footprints} label="行动步数" numeric={s.stats.steps} sub={deskOn ? '电脑操作中' : `返工 ${s.stats.rejectedTasks} 次`} />
      </div>

      <div className="ov-main">
        <Card
          title={deskOn ? `${s.persona.name} 的电脑` : '任务板世界'}
          icon={deskOn ? MonitorSmartphone : Monitor}
          className="ov-feed"
          actions={<button className="link" onClick={() => setView(deskOn ? 'desktop' : 'world')}>{deskOn ? '进入桌面' : '展开'}</button>}>
          {deskOn && d.screen ? (
            <div className="ov-desk-preview" onClick={() => setView('desktop')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setView('desktop')} aria-label="打开智能体桌面">
              <SandboxScreen screen={d.screen} action={d.last} live={s.running && !s.paused} />
              <div className="ov-desk-veil"><span>点击进入第一人称观察</span><ArrowRight size={14} /></div>
            </div>
          ) : (
            <ScreenView world={s.world} persona={s.persona} />
          )}
        </Card>
        <div className="ov-side">
          <Card title="此刻在忙" icon={Target}>
            {goal ? (
              <>
                <div className="ov-goal"><b>{goal.title}</b><span className="muted small">因为{goal.why}</span></div>
                <ol className="dk-plan ov-plan">
                  {planWindow(goal.plan || []).map((step) => (
                    <li key={step.id} className={step.status}><i className={`ov-dot ${step.status}`} /><span>{step.title}</span></li>
                  ))}
                </ol>
                {order && <div className="ov-order"><Bike size={13} /><span>{order.shop} · {order.items.map((x) => x.name).join('、')}</span><Badge tone={order.status === 'awaiting' ? 'warn' : 'accent'}>{order.status === 'awaiting' ? '待批准' : order.status === 'paid' ? '配送中' : '已送达'}</Badge></div>}
              </>
            ) : (
              <div className="muted small">{deskOn ? '正在根据饥饿、能量与余额选择下一个目标…' : '打开「智能体桌面」并绑定内置沙盒后，目标会由生命需求自动产生。'}</div>
            )}
            {s.life?.focus && <div className="life-line"><span>{s.life.focus.stage} · {s.life.focus.age} 岁 · 第 {s.life.focus.gen} 代</span><button className="link" onClick={() => setView('life')}>家族</button></div>}
            <div className="goal"><Sparkles size={13} /><span>{s.persona.goal}</span></div>
          </Card>
          <Card title="生活状态" icon={Gauge}>
            <Meter label="能量" value={energy} />
            <Meter label="心情" value={(s.world?.mood ?? 0) * 100} tone="soft" />
            <Meter label="饥饿" value={hunger * 100} tone={hunger >= 0.6 ? 'warn' : 'accent'} />
          </Card>
          <Card title="最新活动" icon={Activity} className="grow" pad={false} actions={<button className="link" onClick={() => setView('activity')}>全部</button>}>
            <ActivityList items={s.timeline} limit={10} compact />
          </Card>
        </div>
      </div>
    </div>
  );
}
