'use strict';
// 禁止 emoji：扫描界面源码与数据（src/ core/ electron/ index.html），以及冒烟测试导出的渲染文本
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
// Extended_Pictographic 覆盖绝大多数 emoji；另含变体选择符 FE0F、键帽 20E3、区域旗帜、肤色修饰
// 例外：© ® ™ 在默认文本呈现下是排版符号（OSM 署名要求使用 ©），只有后跟 FE0F 时才算 emoji
const EMOJI = /(?![\u00A9\u00AE\u2122])[\p{Extended_Pictographic}\u{FE0F}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/u;
const hits = [];
function scanText(label, text) {
  text.split('\n').forEach((line, i) => { const m = line.match(EMOJI); if (m) hits.push(`${label}:${i + 1}  "${m[0]}" (U+${m[0].codePointAt(0).toString(16).toUpperCase()})  ${line.trim().slice(0, 80)}`); });
}
function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(jsx?|css|html|json)$/.test(f.name)) scanText(path.relative(root, p), fs.readFileSync(p, 'utf8'));
  }
}
['src', 'core', 'electron'].forEach((d) => walk(path.join(root, d)));
scanText('index.html', fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
// 运行时数据：生成多个智能体的人格与模拟世界文本
const { generateDNA } = require('../core/dna');
const { buildPersona } = require('../core/persona');
const { SimWorld } = require('../core/world/simWorld');
for (let i = 0; i < 50; i++) {
  const d = generateDNA('emoji-' + i); const p = buildPersona(d);
  scanText(`persona#${i}`, JSON.stringify(p));
  const w = new SimWorld({ seed: d.seed, skills: d.skills });
  for (const app of ['jobs', 'mail', 'shop', 'wallet', 'notes']) { w.openApp = app; scanText(`world#${i}/${app}`, JSON.stringify(w.screen())); }
}
// 渲染文本（npm run smoke 会导出 rendered-text.txt）
const rendered = path.join(root, 'docs', 'rendered-text.txt');
if (fs.existsSync(rendered)) scanText('rendered-text', fs.readFileSync(rendered, 'utf8'));
else console.log('（提示：未找到 docs/rendered-text.txt，运行 npm run smoke 后会同时检查渲染文本）');
if (hits.length) { console.error('✗ 发现 emoji：\n' + hits.join('\n')); process.exit(1); }
console.log('✓ 界面源码、数据与渲染文本中没有 emoji');
