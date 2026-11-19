'use strict';
class MockEmail {
  constructor({ username }) { this.kind = 'mock'; this.address = `${username}@world.local`; this.outbox = []; }
  async provision() { return { address: this.address }; }
  async send({ to, subject, text }) { const m = { at: Date.now(), to, subject, text }; this.outbox.push(m); return { id: 'mock-' + this.outbox.length }; }
  async list() { return []; }
  summary() { return { kind: this.kind, address: this.address, sent: this.outbox.length }; }
}
module.exports = { MockEmail };
