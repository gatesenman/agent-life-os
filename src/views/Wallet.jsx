import React from 'react';
import { LineChart, BarChart3, ListOrdered, ShieldCheck, Wallet as WalletIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, Stat, money } from '../components/ui.jsx';
import { ApprovalList } from '../components/Chrome.jsx';
import { AreaChart, BarChart, Ring, balanceSeries, flowByDay } from '../components/charts.jsx';
export default function Wallet({ s, mv, c }) {
  const p = s.adapters.payment, pol = s.policy;
  const pending = mv.approvals.reduce((a, b) => a + b.amount, 0);
  return (
    <div className="view wallet">
      <div className="stats4">
        <Stat icon={WalletIcon} label="余额" numeric={p.balance} format={money} sub={`${p.kind === 'mock' ? '模拟钱包' : p.kind} · ****${p.card?.last4 ?? ''}`} />
        <Stat icon={TrendingUp} label="累计收入" numeric={s.stats.earned} format={money} tone="pos" />
        <Stat icon={TrendingDown} label="累计支出" numeric={s.stats.spent} format={money} />
        <Stat icon={ShieldCheck} label="待审批" numeric={pending} format={money} sub={`全部世界共 ${mv.approvals.length} 笔`} tone={mv.approvals.length ? 'warn' : ''} />
      </div>
      {mv.approvals.length > 0 && <Card title="待审批支出（全部平行世界）" icon={ShieldCheck} pad={false}><ApprovalList approvals={mv.approvals} c={c} worlds={mv.worlds} /></Card>}
      <div className="wl-row">
        <Card title="余额走势" icon={LineChart} className="grow"><AreaChart data={balanceSeries(p.ledger)} height={200} format={(v) => `$${v.toFixed(0)}`} /></Card>
        <Card title="今日预算" icon={ShieldCheck} className="budget">
          <Ring value={pol.spentToday} max={pol.dailyCapUsd} size={132} label={money(pol.spentToday)} sub={`/ ${money(pol.dailyCapUsd)}`} />
          <dl className="kv mt"><dt>单笔上限</dt><dd className="num">{money(pol.perTxCapUsd)}</dd><dt>自动批准</dt><dd>{pol.autoApproveBelowUsd > 0 ? `< ${money(pol.autoApproveBelowUsd)}` : '关闭（每笔人工）'}</dd></dl>
        </Card>
      </div>
      <div className="wl-row">
        <Card title="每小时收支" icon={BarChart3} className="grow" actions={<span className="legend"><i className="lg-in" />收入<i className="lg-out" />支出</span>}><BarChart data={flowByDay(p.ledger)} height={170} /></Card>
        <Card title="流水" icon={ListOrdered} className="ledger" pad={false}>
          <table className="table">
            <thead><tr><th>时间</th><th>说明</th><th className="r">金额</th></tr></thead>
            <tbody>{p.ledger.length === 0 && <tr><td colSpan={3} className="muted">还没有流水。批准一笔支出或完成零工后会出现在这里。</td></tr>}{p.ledger.slice().reverse().slice(0, 30).map((t, i) => (
              <tr key={i}><td className="num muted">{t.clock || '—'}</td><td>{t.memo || t.merchant}</td><td className={`r num ${t.amount >= 0 ? 'pos' : ''}`}>{t.amount >= 0 ? '+' : ''}{money(t.amount)}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
