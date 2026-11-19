'use strict';
// QEMU 世界适配器（实验性）：通过 QMP 截图（screendump）与注入键鼠（input-send-event），
// 通过 VNC WebSocket 供观察者实时观看（noVNC）。
// 需要本机已安装 qemu-system-x86_64，并准备好一个磁盘镜像（ALOS_QEMU_IMAGE）。
// 也可以连接一个已运行的 QEMU：设置 ALOS_QMP_SOCKET=/path/to/qmp.sock
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');

class QMP {
  constructor(sock) { this.sock = sock; this.buf = ''; this.queue = []; this.ready = null; }
  connect() {
    return new Promise((resolve, reject) => {
      this.c = net.createConnection(this.sock);
      this.c.on('error', reject);
      this.c.on('data', (d) => {
        this.buf += d.toString();
        let i;
        while ((i = this.buf.indexOf('\n')) >= 0) {
          const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.QMP) { this.cmd('qmp_capabilities').then(() => resolve()).catch(reject); continue; }
          if (msg.event) continue;
          const p = this.queue.shift();
          if (p) msg.error ? p.reject(new Error(msg.error.desc)) : p.resolve(msg.return);
        }
      });
    });
  }
  cmd(execute, args) {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.c.write(JSON.stringify(args ? { execute, arguments: args } : { execute }) + '\n');
    });
  }
  close() { try { this.c.end(); } catch {} }
}

// PPM(P6) -> PNG，无第三方依赖
function ppmToPng(buf) {
  let off = 0; const tok = [];
  while (tok.length < 4) {
    while (/\s/.test(String.fromCharCode(buf[off]))) off++;
    if (buf[off] === 0x23) { while (buf[off] !== 0x0a) off++; continue; }
    let s = ''; while (!/\s/.test(String.fromCharCode(buf[off]))) s += String.fromCharCode(buf[off++]);
    tok.push(s);
  }
  off++;
  const [, w, h] = tok.map((x, i) => (i ? parseInt(x, 10) : x));
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; buf.copy(raw, y * (w * 3 + 1) + 1, off + y * w * 3, off + (y + 1) * w * 3); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return { png: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]), width: w, height: h };
}

const KEYMAP = { ' ': 'spc', '\n': 'ret', '.': 'dot', ',': 'comma', '/': 'slash', '-': 'minus', '=': 'equal', ';': 'semicolon', "'": 'apostrophe', '@': ['shift', '2'], ':': ['shift', 'semicolon'], '!': ['shift', '1'], '?': ['shift', 'slash'], _: ['shift', 'minus'] };

class QemuWorld {
  constructor(opts = {}) {
    this.kind = 'qemu';
    this.opts = {
      qemuBin: process.env.ALOS_QEMU_BIN || 'qemu-system-x86_64',
      image: process.env.ALOS_QEMU_IMAGE,
      qmpSocket: process.env.ALOS_QMP_SOCKET,
      vncDisplay: Number(process.env.ALOS_VNC_DISPLAY || 1),
      vncWsPort: Number(process.env.ALOS_VNC_WS_PORT || 5701),
      memory: process.env.ALOS_QEMU_MEM || '4096',
      ...opts,
    };
    this.last = null;
  }
  async start() {
    let sock = this.opts.qmpSocket;
    if (!sock) {
      if (!this.opts.image) throw new Error('QEMU 模式需要设置 ALOS_QEMU_IMAGE（磁盘镜像）或 ALOS_QMP_SOCKET（已运行的 QEMU）');
      sock = path.join(os.tmpdir(), `alos-qmp-${process.pid}.sock`);
      const args = ['-m', this.opts.memory, '-drive', `file=${this.opts.image},if=virtio`, '-device', 'qemu-xhci', '-device', 'usb-tablet',
        '-qmp', `unix:${sock},server,nowait`, '-vnc', `127.0.0.1:${this.opts.vncDisplay},websocket=${this.opts.vncWsPort}`];
      if (process.platform === 'linux' && fs.existsSync('/dev/kvm')) args.push('-enable-kvm', '-cpu', 'host');
      this.proc = spawn(this.opts.qemuBin, args, { stdio: 'ignore' });
      for (let i = 0; i < 50 && !fs.existsSync(sock); i++) await new Promise((r) => setTimeout(r, 200));
    }
    this.qmp = new QMP(sock);
    await this.qmp.connect();
    this.vncUrl = `ws://127.0.0.1:${this.opts.vncWsPort}/`;
  }
  async screenshotPng() {
    const f = path.join(os.tmpdir(), `alos-shot-${process.pid}.ppm`);
    await this.qmp.cmd('screendump', { filename: f });
    const out = ppmToPng(fs.readFileSync(f));
    this.size = { w: out.width, h: out.height };
    return out;
  }
  async observe() {
    const { png, width, height } = await this.screenshotPng();
    this.last = 'data:image/png;base64,' + png.toString('base64');
    return { kind: 'qemu', width, height, image: this.last, text: `VM 屏幕 ${width}x${height}，请根据截图决定下一步。` };
  }
  screen() { return { kind: 'qemu', image: this.last, vncUrl: this.vncUrl, ...(this.size || {}) }; }
  async act(a) {
    const { w = 1280, h = 800 } = this.size || {};
    if (a.type === 'click') {
      const ax = Math.round((a.x / w) * 32767), ay = Math.round((a.y / h) * 32767);
      const btn = a.button || 'left';
      await this.qmp.cmd('input-send-event', { events: [{ type: 'abs', data: { axis: 'x', value: ax } }, { type: 'abs', data: { axis: 'y', value: ay } }] });
      await this.qmp.cmd('input-send-event', { events: [{ type: 'btn', data: { down: true, button: btn } }] });
      await this.qmp.cmd('input-send-event', { events: [{ type: 'btn', data: { down: false, button: btn } }] });
      return { ok: true, message: `点击 (${a.x},${a.y})` };
    }
    if (a.type === 'type') {
      for (const ch of String(a.text || '')) {
        let keys = KEYMAP[ch] || (/[A-Z]/.test(ch) ? ['shift', ch.toLowerCase()] : ch);
        keys = Array.isArray(keys) ? keys : [keys];
        await this.qmp.cmd('send-key', { keys: keys.map((k) => ({ type: 'qcode', data: k })) });
      }
      return { ok: true, message: `输入文本（${String(a.text).length} 字符）` };
    }
    if (a.type === 'key') {
      const keys = String(a.keys || '').split('+').map((k) => ({ type: 'qcode', data: k.trim().toLowerCase() }));
      await this.qmp.cmd('send-key', { keys });
      return { ok: true, message: `按键 ${a.keys}` };
    }
    if (a.type === 'wait' || a.type === 'rest') return { ok: true, message: '等待' };
    return { ok: false, message: `QEMU 模式不支持动作 ${a.type}` };
  }
  stop() { this.qmp?.close(); this.proc?.kill(); }
}

module.exports = { QemuWorld, ppmToPng };
