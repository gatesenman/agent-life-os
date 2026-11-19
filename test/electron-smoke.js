'use strict';
// Electron 冒烟测试：启动真实窗口（Linux 无显示器时用 xvfb-run），运行数秒后截图到 smoke.png
const { spawnSync } = require('child_process');
const path = require('path');
const electron = require('electron');
const root = path.join(__dirname, '..');
require('fs').rmSync(path.join(root, '.alos-data-smoke'), { recursive: true, force: true }); // 每次从创世开始，截图可复现
const env = { ...process.env, ALOS_SMOKE: '1', ALOS_TICK_MS: '400', ALOS_NO_SANDBOX: '1', ALOS_DATA_DIR: path.join(root, '.alos-data-smoke'), ALOS_SMOKE_OUT: path.join(root, 'smoke.png'), ALOS_SMOKE_DOCS: path.join(root, 'docs'), ALOS_SMOKE_VIEWS: process.env.ALOS_SMOKE_VIEWS || 'onboarding,overview,mirror,life,mirror-street,civ,civ-env,civ-dims,multiverse,compare,wallet,identity,world,memory,god-mirror-place,civ-laws,desktop-approval,desktop,desktop-replay,onboarding-3' + (process.env.ALOS_SMOKE_VNC ? ',desktop-vnc' : '') + ',newagent', ALOS_SEED: process.env.ALOS_SEED || 'demo-aurora', ALOS_YEARS_PER_DAY: process.env.ALOS_YEARS_PER_DAY || '60', ALOS_SMOKE_MS: process.env.ALOS_SMOKE_MS || '14000', ALOS_SMOKE_VIEW_MS: process.env.ALOS_SMOKE_VIEW_MS || '4200' };
const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const cmd = useXvfb ? 'xvfb-run' : electron;
const args = useXvfb ? ['-a', '-s', '-screen 0 1600x960x24', electron, root] : [root];
const r = spawnSync(cmd, args, { env, encoding: 'utf8', timeout: 300000 });
const out = (r.stdout || '') + (r.stderr || '');
const ok = /SMOKE_OK/.test(out) && /violations=0/.test(out);
console.log(out.split('\n').filter((l) => /SMOKE|Error|error/.test(l)).slice(0, 40).join('\n'));
console.log(ok ? '✓ Electron 冒烟测试通过，截图：smoke.png 与 docs/screenshot-*.png' : '✗ 冒烟测试失败');
if (ok) { const r2 = spawnSync(process.execPath, [path.join(__dirname, 'no-emoji.test.js')], { encoding: 'utf8' }); process.stdout.write(r2.stdout + r2.stderr); if (r2.status) process.exit(1); }
process.exit(ok ? 0 : 1);
