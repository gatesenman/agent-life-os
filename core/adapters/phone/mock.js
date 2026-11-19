'use strict';
class MockPhone {
  constructor({ seedDigits = '0000' }) { this.kind = 'mock'; this.number = `+000-WORLD-${seedDigits}`; this.sms = []; }
  async provision() { return { number: this.number }; }
  async sendSms({ to, body }) { this.sms.push({ at: Date.now(), to, body, dir: 'out' }); return { id: 'mock' }; }
  async listSms() { return this.sms; }
  summary() { return { kind: this.kind, number: this.number, note: '虚构号码，仅在模拟世界内有效' }; }
}
module.exports = { MockPhone };
