'use strict';
const { contextBridge, ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add(`platform-${process.platform}`));
contextBridge.exposeInMainWorld('alos', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('alos:getState'),
  newAgent: (seed) => ipcRenderer.invoke('alos:newAgent', seed),
  control: (cmd, arg) => ipcRenderer.invoke('alos:control', cmd, arg),
  mirror: () => ipcRenderer.invoke('alos:mirror'),
  meta: () => ipcRenderer.invoke('alos:meta'),
  desktop: (op, arg) => ipcRenderer.invoke('alos:desktop', op, arg),
  onFrame: (cb) => { const h = (_e, f) => cb(f); ipcRenderer.on('alos:frame', h); return () => ipcRenderer.off('alos:frame', h); },
  onState: (cb) => { const h = (_e, s) => cb(s); ipcRenderer.on('alos:state', h); return () => ipcRenderer.off('alos:state', h); },
  onEvent: (cb) => { const h = (_e, s) => cb(s); ipcRenderer.on('alos:event', h); return () => ipcRenderer.off('alos:event', h); },
});
