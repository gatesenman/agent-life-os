'use strict';
// Twilio 适配器：使用操作者已在 Twilio 购买的号码（TWILIO_PHONE_NUMBER）。
// 注意：Twilio 不提供 +86 号码；中国大陆号码须由操作者本人实名办理，不得为智能体使用他人身份。
class TwilioPhone {
  constructor() {
    this.kind = 'twilio'; this.sid = process.env.TWILIO_ACCOUNT_SID; this.token = process.env.TWILIO_AUTH_TOKEN; this.number = process.env.TWILIO_PHONE_NUMBER;
    if (!this.sid || !this.token || !this.number) throw new Error('缺少 TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER');
  }
  auth() { return 'Basic ' + Buffer.from(`${this.sid}:${this.token}`).toString('base64'); }
  async provision() { return { number: this.number }; }
  async sendSms({ to, body }) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`, {
      method: 'POST', headers: { Authorization: this.auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: this.number, Body: body }).toString(),
    });
    const j = await res.json(); if (!res.ok) throw new Error(`Twilio ${res.status}: ${j.message}`); return j;
  }
  async listSms() {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json?To=${encodeURIComponent(this.number)}&PageSize=20`, { headers: { Authorization: this.auth() } });
    const j = await res.json(); return j.messages || [];
  }
  summary() { return { kind: this.kind, number: this.number }; }
}
module.exports = { TwilioPhone };
