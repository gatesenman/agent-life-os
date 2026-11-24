'use strict';
// 启发式公开发布门禁；只返回规则名和文件名，不在日志回显可能的秘密。
const fs = require('fs'), path = require('path'), cp = require('child_process');
const RULES = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,})/],
  ['service-token', /(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|sk_(?:live|test)_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,})/],
  ['assigned-secret', /(?:OPENAI_API_KEY|STRIPE_SECRET_KEY|AGENTMAIL_API_KEY|TWILIO_AUTH_TOKEN|ALOS_GOOGLE_TILES_KEY|ALOS_CESIUM_ION_TOKEN)[ \t]*[:=][ \t]*["']?[A-Za-z0-9_/-]{16,}/],
];
function scanText(text) { return RULES.filter(([, re]) => re.test(text)).map(([name]) => name); }
function scanFiles(root, files) {
  const findings = [];
  for (const name of files) {
    const base = path.basename(name);
    if ((base.startsWith('.env') && !base.startsWith('.env.example')) || /^(?:desktop-targets|multiverse|memory)\.json/.test(base) || /(?:^|\/)(?:node_modules|userData|recordings|\.alos-data[^/]*)(?:\/|$)/.test(name)) findings.push({ file: name, rule: 'private-runtime-path' });
    const file = path.join(root, name); if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    if (fs.statSync(file).size > 8 * 1024 * 1024) { findings.push({ file: name, rule: 'oversized-source-file' }); continue; }
    for (const rule of scanText(fs.readFileSync(file, 'utf8'))) findings.push({ file: name, rule });
  }
  return findings;
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const files = [...new Set(cp.execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean))];
  const findings = scanFiles(root, files);
  console.log(JSON.stringify({ files: files.length, findings }, null, 2)); process.exitCode = findings.length ? 1 : 0;
}
module.exports = { scanText, scanFiles };
