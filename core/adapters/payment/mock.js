'use strict';
// 模拟钱包：本地账本，开箱即用，不涉及真实资金
class MockPayment {
  constructor({ startBalance = 20, agentName = 'agent' } = {}) {
    this.kind = 'mock'; this.balance = startBalance; this.ledger = [{ at: Date.now(), type: 'fund', amount: startBalance, memo: '操作者初始注资（模拟）' }];
    this.agentName = agentName;
  }
  async provision() { this.card = { brand: 'MOCK', last4: '0000', note: '模拟卡，不可用于真实消费' }; return this.card; }
  async pay({ amount, merchant, memo }) {
    if (amount > this.balance) throw new Error('余额不足');
    this.balance = +(this.balance - amount).toFixed(2);
    const tx = { at: Date.now(), type: 'spend', amount: -amount, merchant, memo, ref: 'mock_' + this.ledger.length.toString().padStart(4, '0') };
    this.ledger.push(tx); return tx;
  }
  async receive({ amount, memo }) {
    this.balance = +(this.balance + amount).toFixed(2);
    const tx = { at: Date.now(), type: 'earn', amount, memo }; this.ledger.push(tx); return tx;
  }
  serialize() { return JSON.parse(JSON.stringify({ balance: this.balance, ledger: this.ledger, card: this.card })); }
  restore(st) { Object.assign(this, JSON.parse(JSON.stringify(st))); }
  summary() { return { kind: this.kind, balance: this.balance, card: this.card, ledger: this.ledger.slice(-50) }; }
}
module.exports = { MockPayment };
