'use strict';
// 无依赖 PNG 编码：输入 32 位像素帧缓冲（RFB 像素格式：小端 0x00RRGGBB，即内存顺序 B,G,R,X），可按比例缩小
const zlib = require('zlib');
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function encodeBGRX(fb, w, h, { maxWidth = 0, level = 3 } = {}) {
  const s = maxWidth && w > maxWidth ? maxWidth / w : 1; const ow = Math.max(1, Math.round(w * s)), oh = Math.max(1, Math.round(h * s));
  const raw = Buffer.alloc((ow * 3 + 1) * oh);
  for (let y = 0; y < oh; y++) {
    const sy = Math.min(h - 1, Math.floor(y / s)); let o = y * (ow * 3 + 1); raw[o++] = 0;
    for (let x = 0; x < ow; x++) { const sx = Math.min(w - 1, Math.floor(x / s)); const i = (sy * w + sx) * 4; raw[o++] = fb[i + 2]; raw[o++] = fb[i + 1]; raw[o++] = fb[i]; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(ow, 0); ihdr.writeUInt32BE(oh, 4); ihdr[8] = 8; ihdr[9] = 2;
  return { png: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]), width: ow, height: oh };
}
module.exports = { encodeBGRX };
