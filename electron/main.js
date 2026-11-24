'use strict';
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadEnv } = require('../core/env');
loadEnv(path.join(__dirname, '..', '.env'));
const { Multiverse } = require('../core/multiverse');

if (process.env.ALOS_NO_SANDBOX === '1') app.commandLine.appendSwitch('no-sandbox');
let win, mv, pushTimer = null;
if (process.env.ALOS_USER_DATA) app.setPath('userData', process.env.ALOS_USER_DATA);
const dataDir = () => process.env.ALOS_DATA_DIR || path.join(app.getPath('userData'), 'agents');

function payload() { return mv?.active ? { world: mv.active.snapshot(), multiverse: mv.summary() } : null; }
function schedulePush() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => { pushTimer = null; if (win && !win.isDestroyed()) win.webContents.send('alos:state', payload()); }, 80);
}

// ---------------- 智能体桌面：本地电脑目标与按智能体绑定 ----------------
// 目标与绑定保存在 <dataDir>/desktop-targets.json；VNC 密码用系统钥匙串（safeStorage）加密，不可用时只保存在内存
const SANDBOX = { id: 'sandbox', kind: 'sandbox', name: '内置沙盒桌面', builtin: true };
const targetsFile = () => path.join(dataDir(), 'desktop-targets.json');
let memPasswords = {};
function loadTargets() { try { return JSON.parse(fs.readFileSync(targetsFile(), 'utf8')); } catch { return { targets: [], bindings: {} }; } }
function saveTargets(t) { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(targetsFile(), JSON.stringify(t, null, 2)); }
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
function withPassword(t) {
  if (!t || t.kind === 'sandbox') return t;
  let password = memPasswords[t.id] || null;
  if (!password && t.passwordEnc) { try { password = safeStorage.decryptString(Buffer.from(t.passwordEnc, 'base64')); } catch {} }
  const { passwordEnc, ...rest } = t; return { ...rest, password };
}
const publicTarget = (t) => { const { passwordEnc, password, ...rest } = t; return { ...rest, hasPassword: !!(passwordEnc || memPasswords[t.id] || password) }; };
function allTargets() { return [SANDBOX, ...loadTargets().targets]; }
function findTarget(id) { return allTargets().find((t) => t.id === id) || null; }
function desktopFor(fingerprint) {
  const st = loadTargets(); const id = st.bindings[fingerprint] ?? (process.env.ALOS_DESKTOP === 'off' ? null : 'sandbox');
  if (!id) return null; return withPassword(findTarget(id)) || SANDBOX;
}
let frameTimer = null;
function scheduleFrame(worldId) {
  if (frameTimer || worldId !== mv?.activeId) return;
  frameTimer = setTimeout(() => { frameTimer = null; const d = mv?.active?.desktop?.driver; if (!d || d.kind !== 'vnc' || !win || win.isDestroyed()) return; const image = d.frame(1280); if (image) win.webContents.send('alos:frame', { worldId: mv.activeId, image, cursor: d.cursor }); }, 250);
}
ipcMain.handle('alos:desktop', async (_e, op, arg = {}) => {
  const st = loadTargets(); const w = mv?.active; const fp = w?.dna?.fingerprint;
  try {
    switch (op) {
      case 'targets': return { targets: allTargets().map(publicTarget), binding: fp ? (st.bindings[fp] ?? (w?.desktop?.target?.id || null)) : null, canEncrypt: canEncrypt() };
      case 'addTarget': {
        const host = String(arg.host || '').trim(); const port = Number(arg.port || 5900);
        if (!host) throw new Error('请填写主机地址'); if (!(port > 0 && port < 65536)) throw new Error('端口无效');
        const t = { id: 'vnc-' + Date.now().toString(36), kind: 'vnc', name: String(arg.name || `${host}:${port}`).slice(0, 40), host, port, note: arg.note ? String(arg.note).slice(0, 80) : undefined };
        if (arg.password) { if (canEncrypt()) t.passwordEnc = safeStorage.encryptString(String(arg.password)).toString('base64'); else memPasswords[t.id] = String(arg.password); }
        st.targets.push(t); saveTargets(st); return { ok: true, target: publicTarget(t), passwordStored: arg.password ? (canEncrypt() ? 'keychain' : 'memory') : 'none' };
      }
      case 'removeTarget': {
        st.targets = st.targets.filter((t) => t.id !== arg.id); for (const k of Object.keys(st.bindings)) if (st.bindings[k] === arg.id) delete st.bindings[k]; saveTargets(st);
        if (w?.desktop?.target?.id === arg.id) w.unbindDesktop(); return { ok: true };
      }
      case 'test': {
        const t = arg.id ? withPassword(findTarget(arg.id)) : { kind: 'vnc', host: arg.host, port: Number(arg.port || 5900), password: arg.password };
        if (!t) throw new Error('找不到这个目标');
        if (t.kind === 'sandbox') return { ok: true, name: '内置沙盒桌面', width: 1280, height: 800, latencyMs: 0, version: '离线模拟', security: '无需连接' };
        const { testVnc } = require('../core/desktop/rfb');
        return await testVnc(t);
      }
      case 'bind': {
        if (!w) throw new Error('当前没有世界'); const t = withPassword(findTarget(arg.id)); if (!t) throw new Error('找不到这个目标');
        st.bindings[fp] = t.id; saveTargets(st); const status = await w.bindDesktop(t); return { ok: status.state !== 'error', status, ...payload() };
      }
      case 'unbind': { if (!w) throw new Error('当前没有世界'); st.bindings[fp] = null; saveTargets(st); w.unbindDesktop(); return { ok: true, ...payload() }; }
      case 'input': { if (!w) throw new Error('当前没有世界'); const res = await w.desktopHumanAct(arg); return { ok: res.ok, message: res.message, ...payload() }; }
      case 'recordings': return { recordings: w?.desktop?.listRecordings() || [] };
      case 'recording': return { recording: w?.desktop?.getRecording(arg.id) || null };
      case 'frame': { const d = w?.desktop?.driver; return { image: d && d.kind === 'vnc' ? d.frame(1280) : null }; }
    }
  } catch (e) { return { ok: false, error: e.message }; }
  return { ok: false, error: '未知操作' };
});

async function genesis(seed, opts = {}) {
  if (!mv) {
    mv = new Multiverse({ dataDir: dataDir(), seed: seed || process.env.ALOS_SEED || undefined, tickMs: Number(process.env.ALOS_TICK_MS || 1500), autostart: process.env.ALOS_AUTOSTART !== '0', desktopFor });
    mv.on('change', schedulePush);
    mv.on('frame', scheduleFrame);
  }
  let resumed = false;
  if (opts.resume && process.env.ALOS_FRESH !== '1') { try { resumed = await mv.resume({ seed: process.env.ALOS_SEED || undefined }); } catch (e) { console.error('resume failed', e); resumed = false; } }
  if (!resumed) await mv.genesis(seed || process.env.ALOS_SEED || undefined);
  persist();
  return payload();
}
// 端到端测试钩子：仅在 ALOS_E2E=1 时向主进程全局暴露多元宇宙，用于读取断言与模拟“时间流逝”（例如饥饿上升）
if (process.env.ALOS_E2E === '1') global.__alos = { get mv() { return mv; }, persist: () => persist() };
// 续存：每 10 秒、以及退出前把所有平行世界写盘；下次打开应用时从这里继续
function persist() { try { mv?.save(); } catch (e) { console.error('persist failed', e.message); } }
setInterval(persist, 10000).unref?.();

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1200, minHeight: 760, backgroundColor: '#0a0b0d', title: 'Agent Life OS',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, vibrancy: 'under-window', visualEffectState: 'active' } : {}),
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#0b0c0f', symbolColor: '#a0a4ad', height: 48 } } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  if (process.env.ALOS_SMOKE === '1') win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) console.log('SMOKE_CONSOLE', msg.slice(0, 400)); });
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('alos:getState', () => payload());
// 镜像世界：街区几何 + 可选 3D Tiles 凭据（只在用户自行配置时提供）
ipcMain.handle('alos:mirror', () => {
  const { loadGeo } = require('../core/life/places');
  return {
    geo: loadGeo(), customAnchor: mirrorStatus, placeTypes: require('../core/life/places').PLACE_TYPES,
    tiles: { googleKey: process.env.ALOS_GOOGLE_TILES_KEY || null, cesiumIonToken: process.env.ALOS_CESIUM_ION_TOKEN || null, cesiumAssetId: Number(process.env.ALOS_CESIUM_ASSET_ID || 96188) },
  };
});
ipcMain.handle('alos:meta', () => {
  const { DIMENSIONS, NEW_LAWS, BASE_LAWS } = require('../core/life/dimensions');
  const { TECHS, ERAS } = require('../core/life/techtree');
  return { dimensions: DIMENSIONS, laws: { ...BASE_LAWS, ...NEW_LAWS }, techs: TECHS, eras: ERAS };
});
let mirrorStatus = null;
async function prepareMirror() {
  const c = process.env.ALOS_MIRROR_CENTER; if (!c) return;
  const [lat, lon] = c.split(',').map(Number); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  try { const { fetchOsm } = require('../core/life/geoFetch'); const r = await fetchOsm(lat, lon, { cacheDir: path.join(dataDir(), 'geo') }); process.env.ALOS_MIRROR_GEO = r.file; mirrorStatus = { ok: true, file: r.file, cached: !!r.cached }; }
  catch (e) { mirrorStatus = { ok: false, error: e.message }; }
}
ipcMain.handle('alos:newAgent', (_e, seed) => genesis(seed));
ipcMain.handle('alos:control', async (_e, cmd, arg) => {
  const w = mv?.active; if (!w) return null;
  try {
    switch (cmd) {
      case 'start': w.start(); break;
      case 'pause': w.pause(); break;
      case 'cancelGoal': w.cancelGoal(); break;
      case 'resume': w.resume(); break;
      case 'step': await w.step(); break;
      case 'speed': w.setSpeed(arg); break;
      case 'takeover': w.setTakeover(arg); break;
      case 'inject': w.inject(arg); break;
      case 'humanAct': if (w.takeover) await w.execute(arg, 'human'); break;
      case 'approve': await mv.approve(arg); break;
      case 'reject': mv.reject(arg); break;
      // 平行世界
      case 'fork': { const n = await mv.fork(arg.fromId || mv.activeId, arg); if (arg.switchTo !== false) mv.switchTo(n.meta.worldId); break; }
      case 'switch': mv.switchTo(arg); break;
      case 'remove': mv.remove(arg); break;
      case 'pauseAll': mv.pauseAll(); break;
      case 'resumeAll': mv.resumeAll(); break;
      // 世界维度体系 / 镜像世界（God Mode）
      case 'lifeConfig': w.lifeConfig(arg); break;
      case 'undoConfig': w.undoConfig(arg); break;
      case 'godEvent': w.godEvent(arg); break;
      case 'editPlace': w.editPlace(arg); break;
      case 'talk': w.talkTo(arg.personId || arg.id, arg.text || arg.message); break;
      case 'fastForwardHunger': await w.fastForwardHunger(arg?.target ?? arg); break;
    }
  } catch (e) { return { error: e.message, ...payload() }; }
  if (['undoConfig', 'cancelGoal', 'fork', 'remove', 'switch', 'approve', 'reject', 'lifeConfig', 'godEvent', 'editPlace', 'pauseAll', 'resumeAll', 'talk', 'fastForwardHunger'].includes(cmd)) persist();
  return payload();
});

app.whenReady().then(async () => {
  createWindow();
  await prepareMirror();
  await genesis(undefined, { resume: true });
  if (process.env.ALOS_SMOKE === '1') runSmoke();
});
app.on('window-all-closed', () => { persist(); mv?.stopAll(); app.quit(); });
app.on('before-quit', persist);

// 冒烟测试：智能体桌面的几个关键时刻（饥饿 → 下单待批准 → 批准后送达用餐 → 回放 → 真实 VNC）
async function smokeDesktop(v, wait) {
  const w = mv.get('w0'); if (!w?.desktop) return;
  const mine = () => mv.allApprovals().filter((a) => a.worldId === 'w0' && a.desktop);
  if (v === 'desktop-approval') {
    w.pause(); w.world.hunger = Math.max(w.world.hunger, 0.72);
    for (let i = 0; i < 90 && !mine().length; i++) { await w.step(); await wait(25); }
    console.log(`SMOKE_DESKTOP approval=${mine().map((a) => a.memo).join('|')}`);
  }
  if (v === 'desktop') {
    w.pause(); for (const a of mine()) await mv.approve(a.id);
    for (let i = 0; i < 90; i++) { await w.step(); await wait(15); const o = w.desktop.os.orders.at(-1); if (o && o.status === 'eaten') break; }
    const o = w.desktop.os.orders.at(-1); console.log(`SMOKE_DESKTOP order=${o?.id} status=${o?.status} hunger=${w.world.hunger.toFixed(2)}`);
    for (let i = 0; i < 4; i++) { await w.step(); await wait(120); }
  }
  if (v === 'desktop-vnc') {
    const spec = process.env.ALOS_SMOKE_VNC; if (!spec) return;
    const [host, port, password] = spec.split(':');
    const st = loadTargets(); let t = st.targets.find((x) => x.host === host && String(x.port) === port);
    if (!t) { t = { id: 'vnc-smoke', kind: 'vnc', name: 'Xvfb 演示机（x11vnc）', host, port: Number(port) }; if (password) memPasswords[t.id] = password; st.targets.push(t); }
    st.bindings[w.dna.fingerprint] = t.id; saveTargets(st);
    const status = await w.bindDesktop(withPassword(t)); console.log(`SMOKE_DESKTOP vnc=${status.state} ${status.name || status.error || ''}`);
    w.setTakeover(true);
  }
}
async function smokeDesktopLive(v, wait) {
  const w = mv.get('w0'); if (!w?.desktop?.active) return;
  if (v === 'desktop') { await w.step(); await wait(700); }
  if (v === 'desktop-vnc' && w.desktop.target?.kind === 'vnc') {
    const r1 = await w.desktopHumanAct({ type: 'click', x: 540, y: 188 }); await wait(500);
    const r2 = await w.desktopHumanAct({ type: 'click', x: 640, y: 279 }); await w.desktopHumanAct({ type: 'type', text: 'hello from agent' }); await wait(1300);
    console.log(`SMOKE_DESKTOP vncInput=${r1.ok && r2.ok}`);
  }
}

// 冒烟测试：运行一段时间，分叉两个平行世界，逐个视图截图、导出渲染文本并退出
function runSmoke() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  (async () => {
    try {
      const outDir = process.env.ALOS_SMOKE_DOCS;
      const views = (process.env.ALOS_SMOKE_VIEWS || 'overview').split(',');
      await wait(Number(process.env.ALOS_SMOKE_MS || 6000) / 2);
      await mv.fork('w0', { name: '节俭的平行自我', branchSeed: 'frugal', genome: { frugality: 0.95 }, policy: { dailyCapUsd: 4 } });
      await mv.fork('w0', { name: '冒险的平行自我', branchSeed: 'risky', genome: { risk_tolerance: 0.95, frugality: 0.1 }, life: { diseaseRate: 0.2, disasterRate: 0.12 }, atStep: Math.max(0, mv.get('w0').stats.steps - 6) });
      await wait(Number(process.env.ALOS_SMOKE_MS || 6000) / 2);
      mv.switchTo('w0');
      await wait(300);
      let text = '';
      for (const v of views) {
        if (v === 'mirror-street') { const w = mv.get('w0'); w.pause(); for (let i = 0; i < 300; i++) { const h = (w.world?.minute ?? 720) / 60; if (h >= 9.5 && h < 15) break; await w.step(); await wait(30); } } // 截一张白天的街区
        if (!v.startsWith('god-') && win.webContents.debugger.isAttached()) { try { await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] }); } catch {} }
        if (v.startsWith('god-')) { try { if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3'); await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); } catch {} } // 软件渲染下动画帧被 3D 占满，截图时用减少动态效果
        if (v.startsWith('desktop')) await smokeDesktop(v, wait);
        await js(`window.__alosNav && window.__alosNav(${JSON.stringify(v)})`);
        await wait(Number(process.env.ALOS_SMOKE_VIEW_MS || 2200) + (v.includes('mirror') ? 3000 : 0)); // 3D 场景在软件渲染下首帧较慢
        if (v.includes('mirror')) console.log(`SMOKE_FPS ${v} ${await js("new Promise((r)=>{let n=0;const t=performance.now();const f=()=>{n++;if(performance.now()-t<2000)requestAnimationFrame(f);else r((n/2).toFixed(1))};requestAnimationFrame(f)})")}`);
        if (v === 'desktop' || v === 'desktop-vnc') await smokeDesktopLive(v, wait); // 截图前再走一步，让光标、涟漪与键入浮层出现在画面里
        const img = await win.webContents.capturePage();
        if (v === 'mirror-street') mv.get('w0').resume();
        if (outDir) fs.writeFileSync(path.join(outDir, `screenshot-${v}.png`), img.toPNG());
        if (v === views[0]) fs.writeFileSync(process.env.ALOS_SMOKE_OUT || path.join(__dirname, '..', 'smoke.png'), img.toPNG());
        if (process.env.ALOS_SMOKE_DUMP) console.log('SMOKE_DUMP', await js(`(document.querySelector(${JSON.stringify(process.env.ALOS_SMOKE_DUMP)})||{}).outerHTML`));
        text += `\n===== ${v} =====\n` + (await js('document.body.innerText'));
      }
      if (outDir) fs.writeFileSync(path.join(outDir, 'rendered-text.txt'), text);
      const s = mv.summary();
      const viol = s.worlds.reduce((a, w) => a + w.violations, 0);
      console.log(`SMOKE_OK worlds=${s.worlds.length} steps=${s.worlds.map((w) => w.steps).join('/')} violations=${viol} views=${views.length}`);
    } catch (e) { console.log('SMOKE_FAIL', e.stack); }
    app.exit(0);
  })();
}
