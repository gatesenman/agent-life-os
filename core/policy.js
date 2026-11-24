'use strict';
// 预算策略：所有有效支出均需人类审批，自动批准配置仅为旧存档兼容保留
class BudgetPolicy {
  constructor({ dailyCapUsd = 10, perTxCapUsd = 25, autoApproveBelowUsd = 0, merchantAllowlist = ['World Shop'] } = {}) {
    Object.assign(this, { dailyCapUsd, perTxCapUsd, autoApproveBelowUsd, merchantAllowlist });
    this.spentToday = 0; this.day = null;
  }
  rollDay(day) { if (day !== this.day) { this.day = day; this.spentToday = 0; } }
  check({ amount, merchant }, { balance }) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount !== Math.round(amount * 100) / 100 || amount <= 0) return { verdict: 'deny', reason: '金额无效' };
    if (!Number.isFinite(balance) || amount > balance) return { verdict: 'deny', reason: '余额不足' };
    if (amount > this.perTxCapUsd) return { verdict: 'deny', reason: `超过单笔上限 $${this.perTxCapUsd}` };
    if (this.spentToday + amount > this.dailyCapUsd) return { verdict: 'deny', reason: `超过每日预算 $${this.dailyCapUsd}` };
    // 旧版自动批准阈值不再生效：每笔支出必须人工确认。
    return { verdict: 'needs_approval', reason: '需要人类守护者批准' };
  }
  record(amount) { this.spentToday += amount; }
  serialize() { return { spentToday: this.spentToday, day: this.day, autoApproveBelowUsd: this.autoApproveBelowUsd, dailyCapUsd: this.dailyCapUsd, perTxCapUsd: this.perTxCapUsd }; }
  summary() { return { dailyCapUsd: this.dailyCapUsd, perTxCapUsd: this.perTxCapUsd, autoApproveBelowUsd: this.autoApproveBelowUsd, spentToday: +this.spentToday.toFixed(2), manualApprovalRequired: true }; }
}
module.exports = { BudgetPolicy };
