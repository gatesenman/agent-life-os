'use strict';
// 平行世界：同一个智能体在多个相互隔离的世界分支中并发运行（定律 L7：分支隔离，不合并）
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { VERSION, writeSave, readSave } = require('./persistence');
const { AgentEngine } = require('./engine');

const COLORS = ['#8b8dff', '#6fd3a0', '#e7b65c', '#ef8a8a', '#7cc4ff', '#c79bff', '#f0a3d0', '#a3e3d8'];
const MAX_WORLDS = 8;

class Multiverse extends EventEmitter {
  constructor({ dataDir, seed, tickMs, autostart = true, desktopFor = null } = {}) {
    super();
    this.base = { dataDir, seed, tickMs }; this.autostart = autostart; this.desktopFor = desktopFor; // desktopFor(fingerprint) → 绑定目标

    this.worlds = new Map(); this.activeId = null; this.counter = 0;
  }
  attach(eng) {
    eng.on('state', () => this.emit('change', eng.meta.worldId));
    eng.on('approval', (ap) => this.emit('approval', ap));
    eng.on('event', (e) => this.emit('event', { worldId: eng.meta.worldId, ...e }));
    eng.on('frame', () => this.emit('frame', eng.meta.worldId));
    this.worlds.set(eng.meta.worldId, eng);
  }
  async genesis(seed = this.base.seed) {
    for (const w of this.worlds.values()) w.stop();
    this.worlds.clear(); this.counter = 0;
    const { generateDNA } = require('./dna');
    const desktop = this.desktopFor ? this.desktopFor(generateDNA(seed).fingerprint) : null;
    const eng = new AgentEngine({ ...this.base, seed, worldId: 'w0', name: '主世界', color: COLORS[0], desktop });
    this.attach(eng); await eng.init(); this.activeId = 'w0';
    if (this.autostart) eng.start();
    if (this.recoveryNotice) eng.log('error', this.recoveryNotice);
    this.emit('change', 'w0');
    return eng;
  }
  get active() { return this.worlds.get(this.activeId); }
  // ---------- 续存：关掉应用再打开，所有平行世界从上次的状态继续 ----------
  get persistFile() { return this.base.dataDir ? path.join(this.base.dataDir, 'multiverse.json') : null; }
  save() {
    const f = this.persistFile; if (!f || !this.worlds.size || this.recoveryBlocked) return false;
    const data = { version: VERSION, savedAt: Date.now(), seed: this.active?.dna?.seed, activeId: this.activeId, counter: this.counter, worlds: [...this.worlds.values()].map((w) => w.persistState()) };
    writeSave(f, data);
    return true;
  }
  async resume({ seed } = {}) {
    const f = this.persistFile; if (!f) return false;
    let loaded; try { loaded = readSave(f); } catch (e) { this.recoveryBlocked = true; this.recoveryNotice = e.message; return false; }
    if (!loaded) return false;
    const data = loaded.data; this.recoveryNotice = loaded.recovered ? '主存档损坏，已从上一份有效备份恢复。' : null;
    if (!data?.worlds?.length || (seed && data.seed && seed !== data.seed)) return false;
    const staged = [];
    const { generateDNA } = require('./dna');
    for (const W of data.worlds) {
      const m = W.meta; const desktop = m.worldId === 'w0' && this.desktopFor ? this.desktopFor(generateDNA(W.opts.seed, W.opts.dnaOverrides).fingerprint) : null;
      const eng = new AgentEngine({ ...this.base, seed: W.opts.seed, dnaOverrides: W.opts.dnaOverrides, tickMs: W.opts.tickMs || this.base.tickMs, worldId: m.worldId, name: m.name, parentId: m.parentId, forkStep: m.forkStep,
        branchSeed: m.branchSeed, color: m.color, policyOverrides: W.policyOverrides, lifeOverrides: W.lifeOverrides, restore: W.state, resumed: true, desktop });
      eng.opts.seed = W.opts.seed; eng.meta.createdAt = m.createdAt || eng.meta.createdAt;
      try { await eng.init(); staged.push({ eng, W }); } catch (e) { for (const x of staged) x.eng.stop(); this.recoveryBlocked = true; this.recoveryNotice = '恢复失败，原存档已保护：' + e.message; return false; }
    }
    for (const w of this.worlds.values()) w.stop();
    this.worlds.clear(); this.counter = data.counter;
    for (const { eng, W } of staged) { this.attach(eng); if (W.running !== false && this.autostart) { eng.start(); if (W.paused) eng.pause(); } }
    this.activeId = data.activeId;
    this.emit('change', this.activeId);
    return true;
  }
  get(id) { return this.worlds.get(id); }
  // fork：从某世界的某一步（快照）分叉出新世界；可改分支种子、性格、预算、节奏
  async fork(fromId, { atStep, name, branchSeed, genome = {}, policy = {}, life = {}, tickMs } = {}) {
    if (this.worlds.size >= MAX_WORLDS) throw new Error(`最多同时运行 ${MAX_WORLDS} 个平行世界`);
    const src = this.worlds.get(fromId); if (!src) throw new Error('源世界不存在');
    if (!src.world.serialize) throw new Error('QEMU 世界暂不支持分叉');
    const snap = src.snapshotAt(atStep);
    const id = `w${++this.counter}`;
    const eng = new AgentEngine({
      ...this.base, seed: src.opts.seed ?? src.dna.seed, worldId: id, name: name || `分支 ${this.counter}`, parentId: fromId, forkStep: snap.step,
      branchSeed: branchSeed ?? Math.random().toString(36).slice(2, 8), color: COLORS[this.counter % COLORS.length],
      dnaOverrides: { ...(src.opts.dnaOverrides || {}), genome: { ...((src.opts.dnaOverrides || {}).genome || {}), ...genome } },
      policyOverrides: { ...src.policyOverrides, ...policy }, lifeOverrides: { ...(src.lifeOverrides || {}), ...life }, tickMs: tickMs || src.opts.tickMs, restore: snap.state,
    });
    eng.opts.seed = src.opts.seed ?? src.dna.seed;
    this.attach(eng); await eng.init();
    if (this.autostart || src.running) eng.start();
    this.emit('change', id);
    return eng;
  }
  switchTo(id) { if (this.worlds.has(id)) { this.activeId = id; this.emit('change', id); } }
  remove(id) {
    if (id === 'w0') throw new Error('主世界不能删除');
    const w = this.worlds.get(id); if (!w) return;
    for (const c of this.worlds.values()) if (c.meta.parentId === id) c.meta.parentId = w.meta.parentId; // 子分支挂到祖先上
    w.stop(); this.worlds.delete(id); if (this.activeId === id) this.activeId = 'w0'; this.emit('change', id);
  }
  pauseAll() { for (const w of this.worlds.values()) if (!w.paused) w.pause(); }
  resumeAll() { for (const w of this.worlds.values()) if (w.paused) w.resume(); }
  allApprovals() { return [...this.worlds.values()].flatMap((w) => w.approvals); }
  async approve(id) { const w = this.worlds.get(id.split(':')[0]); return w ? w.approve(id) : false; }
  reject(id) { const w = this.worlds.get(id.split(':')[0]); return w ? w.reject(id) : false; }
  summary() { return { activeId: this.activeId, worlds: [...this.worlds.values()].map((w) => w.brief()), approvals: this.allApprovals(), max: MAX_WORLDS }; }
  stopAll() { for (const w of this.worlds.values()) w.stop(); }
}
module.exports = { Multiverse };
