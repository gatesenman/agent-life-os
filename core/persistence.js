'use strict';
const fs = require('fs');
const path = require('path');
const VERSION = 2;
function validateSave(data) {
  if (!data || ![1, VERSION].includes(data.version)) throw new Error('不支持的存档版本');
  if (!Array.isArray(data.worlds) || !data.worlds.length || data.worlds.length > 8) throw new Error('存档世界数量无效');
  const ids = new Set();
  for (const w of data.worlds) {
    const id = w?.meta?.worldId;
    if (!/^w[0-9]+$/.test(id) || ids.has(id) || !w.opts || !w.state?.world || !w.state?.payment || !w.state?.memory || !w.state?.policy || !w.state?.stats) throw new Error('存档结构不完整');
    ids.add(id);
  }
  if (!ids.has('w0') || !ids.has(data.activeId)) throw new Error('存档主世界或活动世界缺失');
  return { ...data, version: VERSION, counter: Math.max(Number(data.counter) || 0, ...[...ids].map((id) => Number(id.slice(1)))) };
}
function writeSave(file, data) {
  validateSave(data); fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (fs.existsSync(file)) {
    try { validateSave(JSON.parse(fs.readFileSync(file, 'utf8'))); fs.copyFileSync(file, file + '.bak'); } catch {} // 不用损坏主档覆盖完好的备份
  }
  fs.renameSync(tmp, file);
}
function readSave(file) {
  let present = false;
  for (const candidate of [file, file + '.bak']) {
    if (!fs.existsSync(candidate)) continue;
    present = true;
    try { return { data: validateSave(JSON.parse(fs.readFileSync(candidate, 'utf8'))), recovered: candidate !== file }; } catch {}
  }
  if (present) throw new Error('主存档与备份均不可恢复；已保护原文件，当前临时世界不会覆盖存档');
  return null;
}
module.exports = { VERSION, validateSave, writeSave, readSave };
