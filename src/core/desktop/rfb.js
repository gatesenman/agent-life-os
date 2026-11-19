'use strict';
// 最小 RFB（VNC）客户端：RFB 3.3/3.7/3.8，安全类型 None / VNC 密码；编码 Raw + CopyRect + DesktopSize。
// 适用于 QEMU（-vnc）、VirtualBox（VRDE 需另开 VNC 扩展包）、UTM（基于 QEMU）、x11vnc、TigerVNC、macOS 屏幕共享（需开启“VNC 观看者可使用密码控制屏幕”）等。
const net = require('net');
const { EventEmitter } = require('events');
const { vncAuthResponse } = require('./des');
const { encodeBGRX } = require('./png');

const KEYSYM = { enter: 0xff0d, return: 0xff0d, backspace: 0xff08, tab: 0xff09, escape: 0xff1b, esc: 0xff1b, delete: 0xffff, home: 0xff50, end: 0xff57, pageup: 0xff55, pagedown: 0xff56,
  left: 0xff51, up: 0xff52, right: 0xff53, down: 0xff54, shift: 0xffe1, ctrl: 0xffe3, control: 0xffe3, alt: 0xffe9, meta: 0xffe7, super: 0xffeb, win: 0xffeb, cmd: 0xffeb, space: 0x20 };
for (let i = 1; i <= 12; i++) KEYSYM['f' + i] = 0xffbd + i;
const keysymOf = (ch) => { const c = ch.codePointAt(0); if (ch === '\n') return 0xff0d; if (ch === '\t') return 0xff09; return c < 0x100 ? c : 0x01000000 + c; };

class RFBClient extends EventEmitter {
  constructor({ host = '127.0.0.1', port = 5900, password = '', timeoutMs = 5000 } = {}) {
    super(); Object.assign(this, { host, port: Number(port), password, timeoutMs }); this.buf = Buffer.alloc(0); this.waiters = []; this.buttons = 0; this.dirty = false; this.frames = 0;
  }
  // ---------- 底层读取 ----------
  onData(d) { this.buf = Buffer.concat([this.buf, d]); this.pump(); }
  pump() { while (this.waiters.length && this.buf.length >= this.waiters[0].n) { const w = this.waiters.shift(); const out = this.buf.subarray(0, w.n); this.buf = this.buf.subarray(w.n); w.resolve(Buffer.from(out)); } }
  read(n) { return new Promise((resolve, reject) => { this.waiters.push({ n, resolve, reject }); this.pump(); }); }
  async connect() {
    const t0 = Date.now();
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => { this.sock?.destroy(); reject(new Error(`连接 ${this.host}:${this.port} 超时`)); }, this.timeoutMs);
      this.sock = net.createConnection({ host: this.host, port: this.port }, () => { clearTimeout(to); resolve(); });
      this.sock.on('error', (e) => { clearTimeout(to); reject(new Error(`无法连接 ${this.host}:${this.port}：${e.code || e.message}`)); for (const w of this.waiters.splice(0)) w.reject(new Error(`连接被对方重置（${e.code || e.message}）`)); this.emit('close', e); });
      this.sock.on('data', (d) => this.onData(d));
      this.sock.on('close', () => { this.closed = true; for (const w of this.waiters.splice(0)) w.reject(new Error('连接已关闭')); this.emit('close'); });
    });
    const guard = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('握手超时')), this.timeoutMs))]);
    const ver = (await guard(this.read(12))).toString('latin1');
    const m = ver.match(/RFB (\d{3})\.(\d{3})/); if (!m) throw new Error('不是 VNC 服务器（协议头无效）');
    const minor = +m[1] > 3 ? 8 : Math.min(8, +m[2]); this.version = `3.${minor >= 8 ? 8 : minor >= 7 ? 7 : 3}`;
    this.sock.write(`RFB 003.00${this.version.slice(2)}\n`);
    let sec;
    if (this.version === '3.3') sec = (await guard(this.read(4))).readUInt32BE(0);
    else {
      const n = (await guard(this.read(1)))[0];
      if (!n) { const len = (await this.read(4)).readUInt32BE(0); throw new Error('服务器拒绝：' + (await this.read(len)).toString()); }
      const types = [...(await this.read(n))];
      sec = types.includes(1) && !this.password ? 1 : types.includes(2) ? 2 : types.includes(1) ? 1 : 0;
      if (!sec) throw new Error(`不支持的安全类型 ${types.join(',')}（仅支持 None 与 VNC 密码；请在服务器上关闭 TLS/VeNCrypt 或使用 SSH 隧道）`);
      this.sock.write(Buffer.from([sec]));
    }
    this.security = sec === 1 ? 'None' : 'VNC 密码';
    if (sec === 2) { if (!this.password) throw new Error('服务器要求 VNC 密码'); const ch = await guard(this.read(16)); this.sock.write(vncAuthResponse(this.password, ch)); }
    if (sec === 2 || this.version === '3.8') {
      const res = (await guard(this.read(4))).readUInt32BE(0);
      if (res !== 0) { let why = '认证失败'; if (this.version === '3.8') { try { const l = (await this.read(4)).readUInt32BE(0); why += '：' + (await this.read(l)).toString(); } catch {} } throw new Error(why); }
    }
    this.sock.write(Buffer.from([1])); // ClientInit：共享会话
    const si = await guard(this.read(24)); this.width = si.readUInt16BE(0); this.height = si.readUInt16BE(2);
    const nl = si.readUInt32BE(20); this.name = (await this.read(nl)).toString('utf8');
    this.fb = Buffer.alloc(this.width * this.height * 4);
    // 像素格式：32bpp 小端真彩色 R<<16 G<<8 B
    const pf = Buffer.alloc(20); pf[0] = 0; pf[4] = 32; pf[5] = 24; pf[6] = 0; pf[7] = 1; pf.writeUInt16BE(255, 8); pf.writeUInt16BE(255, 10); pf.writeUInt16BE(255, 12); pf[14] = 16; pf[15] = 8; pf[16] = 0; this.sock.write(pf);
    const encs = [0, 1, -223]; const se = Buffer.alloc(4 + encs.length * 4); se[0] = 2; se.writeUInt16BE(encs.length, 2); encs.forEach((e, i) => se.writeInt32BE(e, 4 + i * 4)); this.sock.write(se);
    this.latencyMs = Date.now() - t0;
    this.loop().catch((e) => { if (!this.closed) this.emit('error', e); });
    this.request(false);
    return { name: this.name, width: this.width, height: this.height, version: this.version, security: this.security, latencyMs: this.latencyMs };
  }
  request(incremental = true) { if (this.closed) return; const b = Buffer.alloc(10); b[0] = 3; b[1] = incremental ? 1 : 0; b.writeUInt16BE(this.width, 6); b.writeUInt16BE(this.height, 8); this.sock.write(b); }
  async loop() {
    for (;;) {
      const t = (await this.read(1))[0];
      if (t === 0) {
        const h = await this.read(3); const n = h.readUInt16BE(1);
        for (let i = 0; i < n; i++) {
          const r = await this.read(12); const x = r.readUInt16BE(0), y = r.readUInt16BE(2), w = r.readUInt16BE(4), hh = r.readUInt16BE(6), enc = r.readInt32BE(8);
          if (enc === 0) { const px = await this.read(w * hh * 4); for (let row = 0; row < hh; row++) px.copy(this.fb, ((y + row) * this.width + x) * 4, row * w * 4, (row + 1) * w * 4); }
          else if (enc === 1) { const s = await this.read(4); const sx = s.readUInt16BE(0), sy = s.readUInt16BE(2); const tmp = Buffer.alloc(w * hh * 4); for (let row = 0; row < hh; row++) this.fb.copy(tmp, row * w * 4, ((sy + row) * this.width + sx) * 4, ((sy + row) * this.width + sx + w) * 4); for (let row = 0; row < hh; row++) tmp.copy(this.fb, ((y + row) * this.width + x) * 4, row * w * 4, (row + 1) * w * 4); }
          else if (enc === -223) { this.width = w; this.height = hh; this.fb = Buffer.alloc(w * hh * 4); }
          else throw new Error('未知编码 ' + enc);
        }
        this.dirty = true; this.frames++; this.emit('frame');
        setTimeout(() => this.request(true), 60);
      } else if (t === 1) { const h = await this.read(5); await this.read(h.readUInt16BE(3) * 6); }
      else if (t === 2) { /* bell */ }
      else if (t === 3) { const h = await this.read(7); await this.read(h.readUInt32BE(3)); }
      else throw new Error('未知服务器消息 ' + t);
    }
  }
  waitFrame(ms = 1500) { return new Promise((r) => { const f = () => { clearTimeout(t); r(true); }; const t = setTimeout(() => { this.off('frame', f); r(false); }, ms); this.once('frame', f); this.request(false); }); }
  // ---------- 输入 ----------
  pointer(x, y, mask = this.buttons) { const b = Buffer.alloc(6); b[0] = 5; b[1] = mask; b.writeUInt16BE(Math.max(0, Math.min(this.width - 1, Math.round(x))), 2); b.writeUInt16BE(Math.max(0, Math.min(this.height - 1, Math.round(y))), 4); this.sock.write(b); this.cursor = { x, y }; }
  async click(x, y, button = 1, double = false) { const bit = button === 3 ? 4 : button === 2 ? 2 : 1; this.pointer(x, y, 0); await sleep(30); for (let i = 0; i < (double ? 2 : 1); i++) { this.pointer(x, y, bit); await sleep(40); this.pointer(x, y, 0); await sleep(60); } }
  async scroll(x, y, dy) { const bit = dy > 0 ? 16 : 8; const n = Math.max(1, Math.round(Math.abs(dy) / 100)); for (let i = 0; i < n; i++) { this.pointer(x, y, bit); await sleep(20); this.pointer(x, y, 0); await sleep(20); } }
  key(sym, down) { const b = Buffer.alloc(8); b[0] = 4; b[1] = down ? 1 : 0; b.writeUInt32BE(sym >>> 0, 4); this.sock.write(b); }
  async type(text) { for (const ch of String(text)) { const s = keysymOf(ch); const up = /[A-Z~!@#$%^&*()_+{}|:"<>?]/.test(ch); if (up) this.key(0xffe1, true); this.key(s, true); this.key(s, false); if (up) this.key(0xffe1, false); await sleep(12); } }
  async combo(keys) { const parts = String(keys).toLowerCase().split('+').map((k) => k.trim()).filter(Boolean); const syms = parts.map((k) => KEYSYM[k] ?? keysymOf(k.length === 1 ? k : k[0])); for (const s of syms) { this.key(s, true); await sleep(15); } for (const s of syms.reverse()) { this.key(s, false); await sleep(15); } }
  screenshot({ maxWidth = 0 } = {}) { return encodeBGRX(this.fb, this.width, this.height, { maxWidth }); }
  close() { this.closed = true; try { this.sock?.end(); this.sock?.destroy(); } catch {} }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function testVnc(target) {
  const c = new RFBClient({ host: target.host, port: target.port, password: target.password, timeoutMs: 4000 });
  try { const info = await c.connect(); const got = await c.waitFrame(2500); const shot = got ? c.screenshot({ maxWidth: 480 }) : null; return { ok: true, ...info, firstFrame: got, preview: shot ? 'data:image/png;base64,' + shot.png.toString('base64') : null }; }
  catch (e) { return { ok: false, error: e.message }; } finally { c.close(); }
}
module.exports = { RFBClient, testVnc, KEYSYM };
