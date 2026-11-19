'use strict';
// 镜像世界的地点层：把模拟中的"住宅/工作/商店/医院/学校/公园/农场/文化中心"映射到真实地理数据（OSM）上。
// 默认使用随包附带的上海陆家嘴 OSM 切片（© OpenStreetMap contributors, ODbL）。
const fs = require('fs');
const path = require('path');
const { createRng } = require('../prng');

const PLACE_TYPES = {
  home: { zh: '住宅', desc: '睡觉、休息、家庭生活' },
  work: { zh: '写字楼', desc: '劳动与收入' },
  shop: { zh: '商店餐饮', desc: '消费、交易' },
  hospital: { zh: '医院', desc: '每家使死亡风险 −6%（最多 −30%）' },
  school: { zh: '学校', desc: '每所使教育 +0.05' },
  park: { zh: '公园', desc: '心情 +，社交' },
  farm: { zh: '城市农场', desc: '每个使粮食产量 +10%' },
  culture: { zh: '文化中心', desc: '文化与意义感 +' },
};
const DEFAULT_GEO = path.join(__dirname, '..', '..', 'src', 'assets', 'geo', 'osm-lujiazui.json');
let geoCache = null;
function loadGeo(file = process.env.ALOS_MIRROR_GEO || DEFAULT_GEO) {
  if (geoCache && geoCache.file === file) return geoCache.data;
  let data; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = JSON.parse(fs.readFileSync(DEFAULT_GEO, 'utf8')); }
  geoCache = { file, data }; return data;
}
const centroid = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
const r1 = (v) => Math.round(v * 10) / 10;

function defaultPlaces(seed, geo = loadGeo()) {
  const rng = createRng(seed, 'places');
  const out = []; let n = 0;
  const add = (type, name, x, z, extra = {}) => out.push({ id: 'pl' + (++n), type, name, x: r1(x), z: r1(z), ...extra });
  const bs = geo.buildings.map((b) => ({ ...b, c: centroid(b.p) }));
  const named = bs.filter((b) => b.n && (b.h || 0) > 60).sort((a, b) => (b.h || 0) - (a.h || 0));
  for (const b of named.slice(0, 6)) add('work', b.n, b.c[0], b.c[1], { osm: true });
  const shops = geo.pois.filter((p) => /restaurant|cafe|fast_food|shop:|bar/.test(p.k) && p.n);
  for (const p of rng.sample(shops, 6)) add('shop', p.n, p.x, p.z, { osm: true });
  const culture = geo.pois.filter((p) => /theatre|cinema|library|arts/.test(p.k) && p.n);
  for (const p of culture.slice(0, 2)) add('culture', p.n, p.x, p.z, { osm: true });
  for (const [i, pk] of geo.parks.slice(0, 3).entries()) { const c = centroid(pk.p); add('park', ['滨江绿地', '中心绿地', '街心公园'][i], c[0], c[1], { osm: true }); }
  const plain = bs.filter((b) => !b.n).sort((a, b) => (a.h || 30) - (b.h || 30));
  const homes = rng.sample(plain.slice(0, Math.max(12, Math.floor(plain.length * 0.6))), 10);
  for (const [i, b] of homes.entries()) add('home', `住宅 ${String.fromCharCode(65 + i)} 栋`, b.c[0], b.c[1], { osm: true });
  // 切片内缺少的公共设施：以"镜像补全"方式落在空地上（标记 virtual，界面会注明）
  const hasH = geo.pois.find((p) => /hospital|clinic/.test(p.k));
  if (hasH) add('hospital', hasH.n || '社区医院', hasH.x, hasH.z, { osm: true }); else add('hospital', '社区医院（镜像补全）', -180, 120, { virtual: true });
  const hasS = geo.pois.find((p) => /school|university|kindergarten/.test(p.k));
  if (hasS) add('school', hasS.n || '学校', hasS.x, hasS.z, { osm: true }); else add('school', '社区学校（镜像补全）', 220, 160, { virtual: true });
  add('farm', '屋顶城市农场（镜像补全）', 260, -180, { virtual: true });
  return out;
}
function placeEffects(places) {
  const c = (t) => places.filter((p) => p.type === t).length;
  return { mort: 1 - Math.min(0.3, 0.06 * c('hospital')), edu: 0.05 * c('school'), mood: 0.02 * Math.min(5, c('park')), food: 0.1 * c('farm'), culture: 0.05 * c('culture'), homes: c('home'), works: c('work') };
}
// 作息：按世界小时与年龄决定此刻所在地点类型
function scheduleType(hour, age, p) {
  if (age < 6) return 'home';
  if (age < 18) return hour >= 8 && hour < 16 ? 'school' : hour >= 16 && hour < 19 ? 'park' : 'home';
  if (age >= 68) return hour >= 9 && hour < 11 ? 'park' : hour >= 15 && hour < 17 ? (p.belief === 'tradition' ? 'culture' : 'park') : 'home';
  if (hour < 7.5 || hour >= 21.5) return 'home';
  if (hour < 8.5) return 'shop';
  if (hour < 12 || (hour >= 13 && hour < 18)) return p.sick ? 'hospital' : 'work';
  if (hour < 13) return 'shop';
  if (hour < 20) return (p.extraversion || 0.5) > 0.55 ? 'park' : p.belief === 'tradition' ? 'culture' : 'shop';
  return 'home';
}
// 天气：由 (种子, 世界日, 气候异常, 季节) 确定性派生；不消耗世界 RNG，不改变模拟轨迹
const WEATHER = ['晴', '多云', '阴', '小雨', '雷雨', '雾', '雪'];
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function weatherAt(seed, day, hour, anomaly = 0, season = 0.5) {
  const u = hash(`${seed}|${day}|${Math.floor(hour / 6)}`), v = hash(`${seed}|${day}|t`);
  const winter = Math.cos(season * 2 * Math.PI); // 1=冬, -1=夏（北半球，季节 0 = 1 月 1 日）
  const tempC = Math.round((17 - 9 * winter + anomaly * 1.0 + (v - 0.5) * 6) * 10) / 10;
  const stormBoost = Math.min(0.25, Math.abs(anomaly) * 0.05);
  let kind = u < 0.34 - stormBoost ? '晴' : u < 0.58 ? '多云' : u < 0.7 ? '阴' : u < 0.84 ? '小雨' : u < 0.9 + stormBoost * 0.3 ? '雷雨' : '雾';
  if ((kind === '小雨' || kind === '雷雨') && tempC < 1) kind = '雪';
  const cloud = { 晴: 0.08, 多云: 0.45, 阴: 0.85, 小雨: 0.8, 雷雨: 0.95, 雾: 0.6, 雪: 0.85 }[kind];
  return { kind, tempC, cloud, rain: kind === '小雨' ? 0.5 : kind === '雷雨' ? 1 : 0, snow: kind === '雪' ? 0.8 : 0, fog: kind === '雾' ? 0.8 : kind === '阴' ? 0.25 : 0.05, lightning: kind === '雷雨' };
}
// 太阳：小时 → 时角；季节 → 赤纬（23.44° × sin）
function sunAt(hour, season, lat = 31.2) {
  const decl = 23.44 * Math.sin(2 * Math.PI * (season - 80 / 365));
  const ha = (hour - 12) * 15;
  const rad = Math.PI / 180;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(decl * rad) + Math.cos(lat * rad) * Math.cos(decl * rad) * Math.cos(ha * rad)) / rad;
  const az = Math.atan2(Math.sin(ha * rad), Math.cos(ha * rad) * Math.sin(lat * rad) - Math.tan(decl * rad) * Math.cos(lat * rad)) / rad + 180;
  return { altitude: Math.round(alt * 10) / 10, azimuth: Math.round(az * 10) / 10, declination: Math.round(decl * 10) / 10, subsolarLon: -ha };
}
module.exports = { PLACE_TYPES, loadGeo, defaultPlaces, placeEffects, scheduleType, weatherAt, sunAt, WEATHER, DEFAULT_GEO };
