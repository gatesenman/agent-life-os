'use strict';
// AgentMail 适配器 https://docs.agentmail.to （收件箱归属操作者的 AgentMail 账户）
const BASE = process.env.AGENTMAIL_BASE_URL || 'https://api.agentmail.to';
class AgentMailEmail {
  constructor({ username, displayName }) {
    this.kind = 'agentmail'; this.key = process.env.AGENTMAIL_API_KEY; this.username = username; this.displayName = displayName; this.outbox = [];
    if (!this.key) throw new Error('缺少 AGENTMAIL_API_KEY');
  }
  async api(method, p, body) {
    const res = await fetch(BASE + p, { method, headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`AgentMail ${res.status}: ${j.message || j.name}`);
    return j;
  }
  async provision() {
    if (process.env.AGENTMAIL_INBOX_ID) { this.inboxId = process.env.AGENTMAIL_INBOX_ID; this.address = this.inboxId; return { address: this.address }; }
    const r = await this.api('POST', '/v0/inboxes', { username: this.username, display_name: `${this.displayName} (AI)`, metadata: { alos: true } });
    this.inboxId = r.inbox_id; this.address = r.email; return { address: r.email };
  }
  async send({ to, subject, text }) {
    const disclosure = '\n\n—— 本邮件由 AI 智能体代表其操作者发送。';
    const r = await this.api('POST', `/v0/inboxes/${encodeURIComponent(this.inboxId)}/messages/send`, { to, subject, text: text + disclosure });
    this.outbox.push({ at: Date.now(), to, subject }); return r;
  }
  async list() { const r = await this.api('GET', `/v0/inboxes/${encodeURIComponent(this.inboxId)}/messages`); return r.messages || []; }
  summary() { return { kind: this.kind, address: this.address, sent: this.outbox.length }; }
}
module.exports = { AgentMailEmail };
