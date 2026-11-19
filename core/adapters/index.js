'use strict';
const { MockPayment } = require('./payment/mock');
const { MockEmail } = require('./email/mock');
const { MockPhone } = require('./phone/mock');

// 根据环境变量选择适配器；任何真实适配器初始化失败都会回退到 mock 并给出提示
function buildAdapters({ persona, dna, log = () => {} }) {
  const username = 'alos-' + dna.fingerprint.slice(0, 8).toLowerCase();
  const pick = (envName, real, mock) => {
    const want = (process.env[envName] || 'mock').toLowerCase();
    if (want === 'mock') return mock();
    try { return real(want); } catch (e) { log(`适配器 ${envName}=${want} 初始化失败，回退到 mock：${e.message}`); return mock(); }
  };
  const payOpts = { startBalance: dna.economy.start_budget_usd, agentName: persona.name, dailyCapUsd: dna.economy.daily_spend_cap_usd };
  const payment = pick('ALOS_PAYMENT', (w) => { if (w !== 'stripe') throw new Error('未知支付适配器'); return new (require('./payment/stripeTest').StripeTestPayment)(payOpts); }, () => new MockPayment(payOpts));
  const email = pick('ALOS_EMAIL', (w) => { if (w !== 'agentmail') throw new Error('未知邮箱适配器'); return new (require('./email/agentmail').AgentMailEmail)({ username, displayName: persona.name }); }, () => new MockEmail({ username }));
  const phone = pick('ALOS_PHONE', (w) => { if (w !== 'twilio') throw new Error('未知电话适配器'); return new (require('./phone/twilio').TwilioPhone)(); }, () => new MockPhone({ seedDigits: dna.fingerprint.slice(8, 12) }));
  return { payment, email, phone };
}
module.exports = { buildAdapters };
