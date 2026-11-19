'use strict';
// Stripe Issuing 测试模式适配器：为智能体创建持卡人 + 虚拟卡（带支出限额），
// 支付时用 Stripe 测试助手（test_helpers）模拟一笔授权并捕获。只接受 sk_test_ 密钥。
// 前提：操作者（真人/公司）的 Stripe 账户已开通 Issuing（测试模式可直接试用）。
// 文档：https://docs.stripe.com/issuing/cards/virtual/issue-cards  https://docs.stripe.com/issuing/agents
const { MockPayment } = require('./mock');

function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(x)}`)));
    else if (typeof v === 'object') form(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join('&');
}

class StripeTestPayment extends MockPayment {
  constructor(opts) {
    super(opts);
    this.kind = 'stripe-test';
    this.key = process.env.STRIPE_SECRET_KEY || '';
    if (!this.key.startsWith('sk_test_')) throw new Error('出于安全考虑，原型只接受 Stripe 测试密钥（sk_test_...）');
    this.dailyCapCents = Math.round((opts.dailyCapUsd || 10) * 100);
  }
  async api(method, p, body) {
    const res = await fetch('https://api.stripe.com/v1' + p, {
      method, headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body ? form(body) : undefined,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${j.error?.message}`);
    return j;
  }
  async provision() {
    const op = process.env.ALOS_OPERATOR_NAME || 'Operator';
    // 持卡人登记为人类操作者（法律责任人），而非虚构角色
    const ch = await this.api('POST', '/issuing/cardholders', {
      type: 'individual', name: op, email: process.env.ALOS_OPERATOR_EMAIL,
      billing: { address: { line1: process.env.ALOS_OPERATOR_ADDRESS_LINE1 || '123 Test St', city: process.env.ALOS_OPERATOR_CITY || 'San Francisco', state: process.env.ALOS_OPERATOR_STATE || 'CA', postal_code: process.env.ALOS_OPERATOR_POSTAL || '94111', country: process.env.ALOS_OPERATOR_COUNTRY || 'US' } },
      metadata: { alos_agent: this.agentName },
    });
    const card = await this.api('POST', '/issuing/cards', {
      cardholder: ch.id, currency: 'usd', type: 'virtual', status: 'active',
      spending_controls: { spending_limits: [{ amount: this.dailyCapCents, interval: 'daily' }] },
      metadata: { alos_agent: this.agentName },
    });
    this.cardId = card.id;
    this.card = { brand: card.brand, last4: card.last4, id: card.id, note: 'Stripe 测试模式虚拟卡，持卡人为操作者' };
    return this.card;
  }
  async pay({ amount, merchant, memo }) {
    if (amount > this.balance) throw new Error('余额不足');
    const auth = await this.api('POST', '/test_helpers/issuing/authorizations', { card: this.cardId, amount: Math.round(amount * 100), currency: 'usd', merchant_data: { name: merchant } });
    if (!auth.approved) throw new Error('Stripe 授权被拒绝（可能超出卡片限额）');
    await this.api('POST', `/test_helpers/issuing/authorizations/${auth.id}/capture`, {});
    this.balance = +(this.balance - amount).toFixed(2);
    const tx = { at: Date.now(), type: 'spend', amount: -amount, merchant, memo, ref: auth.id };
    this.ledger.push(tx); return tx;
  }
}
module.exports = { StripeTestPayment };
