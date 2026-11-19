'use strict';
// 可选：为自定义锚点（ALOS_MIRROR_CENTER=lat,lon）从 OpenStreetMap Overpass API 下载街区数据（免费、无需密钥）。
// 失败时回退到随包附带的陆家嘴切片。数据许可：© OpenStreetMap contributors, ODbL 1.0（界面会显示署名）。
const fs = require('fs');
const path = require('path');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

function toCompact(osm, lat0, lon0, bbox, name) {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, kz = 110540;
  const nodes = new Map(); for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, [e.lat, e.lon]);
  const P = (ll) => [Math.round((ll[1] - lon0) * kx * 10) / 10, Math.round(-(ll[0] - lat0) * kz * 10) / 10];
  const out = { source: '\u00A9 OpenStreetMap contributors (ODbL 1.0), via Overpass API', fetched: new Date().toISOString().slice(0, 10), name, center: [lat0, lon0], bbox, buildings: [], roads: [], parks: [], water: [], pois: [] };
  for (const e of osm.elements) {
    const t = e.tags || {};
    if (e.type === 'way' && e.nodes) {
      const pts = e.nodes.map((n) => nodes.get(n)).filter(Boolean).map(P); if (pts.length < 2) continue;
      if (t.building) {
        let h = parseFloat(String(t.height || '').replace('m', '')); if (!h && t['building:levels']) h = parseFloat(t['building:levels']) * 3.3;
        const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
        out.buildings.push({ p: closed ? pts.slice(0, -1) : pts, ...(h ? { h: Math.round(h * 10) / 10 } : {}), ...(t.name ? { n: t['name:zh'] || t.name } : {}) });
      } else if (t.highway) out.roads.push({ t: t.highway, p: pts, ...(t.name ? { n: t.name } : {}) });
      else if (t.leisure === 'park') out.parks.push({ p: pts });
      else if (t.natural === 'water' || t.waterway) out.water.push({ p: pts });
    } else if (e.type === 'node' && (t.amenity || t.shop)) {
      const k = t.amenity || 'shop:' + t.shop; if (['bench', 'toilets', 'post_box', 'fountain', 'parking_entrance', 'taxi', 'atm'].includes(k)) continue;
      const [x, z] = P([e.lat, e.lon]); out.pois.push({ k, n: t['name:zh'] || t.name || '', x, z });
    }
  }
  return out;
}
async function fetchOsm(lat, lon, { halfM = 550, cacheDir, timeoutMs = 45000 } = {}) {
  const dLat = halfM / 110540, dLon = halfM / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => Math.round(v * 1e5) / 1e5);
  const file = cacheDir && path.join(cacheDir, `osm-${bbox.join('_')}.json`);
  if (file && fs.existsSync(file)) return { file, cached: true };
  const b = bbox.join(',');
  const q = `[out:json][timeout:40];(way["building"](${b});way["highway"](${b});way["leisure"="park"](${b});way["natural"="water"](${b});node["amenity"](${b});node["shop"](${b}););out body;>;out skel qt;`;
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': 'AgentLifeOS/0.3 (prototype; mirror world)', Accept: 'application/json' }, signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
      const data = toCompact(await res.json(), lat, lon, bbox, `镜像锚点 ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      if (data.buildings.length < 5) throw new Error('该区域 OSM 建筑过少');
      if (file) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); }
      return { file, data };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
module.exports = { fetchOsm, toCompact };
