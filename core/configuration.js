'use strict';
const { CONFIG_SPEC } = require('./life/society');
function previewConfig(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('法则补丁必须是对象');
  const changes = [];
  for (const [key, value] of Object.entries(patch)) {
    const spec = CONFIG_SPEC[key];
    if (!spec) { if (Object.hasOwn(current, key) && current[key] === value) continue; throw new Error('不可修改的法则：' + key); }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max) throw new Error(`${spec.zh}必须在 ${spec.min}–${spec.max} 之间`);
    if (value !== current[key]) changes.push({ key, title: spec.zh, before: current[key], after: value });
  }
  return changes;
}
module.exports = { previewConfig };
