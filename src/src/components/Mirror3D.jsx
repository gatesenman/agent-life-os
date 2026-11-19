import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Home, Building2, ShoppingBag, Cross, GraduationCap, Trees, Wheat, Landmark, User, Crown, MapPin } from 'lucide-react';
import land from '../assets/geo/ne_110m_land.json';

// 镜像世界：地球 → 街区 两级视图。地球轮廓来自 Natural Earth（公有领域），街区来自 OpenStreetMap（ODbL）。
export const PLACE_META = {
  home: { zh: '住宅', color: '#9aa3b5', icon: Home }, work: { zh: '写字楼', color: '#8b8dff', icon: Building2 }, shop: { zh: '商店餐饮', color: '#e7b65c', icon: ShoppingBag },
  hospital: { zh: '医院', color: '#ef8a8a', icon: Cross }, school: { zh: '学校', color: '#7cc4ff', icon: GraduationCap }, park: { zh: '公园', color: '#6fd3a0', icon: Trees },
  farm: { zh: '城市农场', color: '#a3d977', icon: Wheat }, culture: { zh: '文化中心', color: '#c79bff', icon: Landmark },
};
const DEG = Math.PI / 180;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hashN = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
function llToVec(lat, lon, r = 1) { return new THREE.Vector3(r * Math.cos(lat * DEG) * Math.cos(lon * DEG), r * Math.sin(lat * DEG), -r * Math.cos(lat * DEG) * Math.sin(lon * DEG)); }
function seeded(seed) { let a = Math.floor(seed * 4294967296) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- 地球纹理（离线、程序化 + Natural Earth 轮廓） ----------
function earthTextures() {
  const W = 2048, H = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const day = mk(), night = mk(), clouds = mk();
  const paths = land.polygons.map((poly) => { const p = new Path2D(); poly.forEach(([lon, lat], i) => { const x = ((lon + 180) / 360) * W, y = ((90 - lat) / 180) * H; i ? p.lineTo(x, y) : p.moveTo(x, y); }); p.closePath(); return p; });
  let g = day.getContext('2d');
  const oc = g.createLinearGradient(0, 0, 0, H); oc.addColorStop(0, '#0c1522'); oc.addColorStop(0.5, '#0f1c2d'); oc.addColorStop(1, '#0c1522');
  g.fillStyle = oc; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(139,141,255,0.06)'; g.lineWidth = 1;
  for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(0, (i * H) / 12); g.lineTo(W, (i * H) / 12); g.stroke(); }
  for (let i = 1; i < 24; i++) { g.beginPath(); g.moveTo((i * W) / 24, 0); g.lineTo((i * W) / 24, H); g.stroke(); }
  g.fillStyle = '#2b3442'; g.strokeStyle = '#4a5568'; g.lineWidth = 1.2;
  for (const p of paths) { g.fill(p); g.stroke(p); }
  g = night.getContext('2d'); g.fillStyle = '#060a13'; g.fillRect(0, 0, W, H); g.fillStyle = '#1a2231'; g.strokeStyle = 'rgba(130,150,205,0.42)'; g.lineWidth = 1.1; for (const p of paths) { g.fill(p); g.stroke(p); }
  const rnd = seeded(0.42);
  for (let i = 0; i < 6000; i++) {
    const x = rnd() * W, y = (0.12 + rnd() * 0.68) * H;
    if (!paths.some((p) => g.isPointInPath(p, x, y))) continue;
    const s = rnd() < 0.08 ? 2.2 : 1.1; g.fillStyle = `rgba(255,${190 + Math.floor(rnd() * 40)},120,${0.35 + rnd() * 0.5})`; g.fillRect(x, y, s, s);
  }
  g = clouds.getContext('2d'); g.clearRect(0, 0, W, H);
  const cr = seeded(0.77);
  for (let i = 0; i < 900; i++) { const x = cr() * W, y = (0.08 + cr() * 0.84) * H, r = 10 + cr() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.12 + cr() * 0.2})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const t = (c) => { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; };
  return { day: t(day), night: t(night), clouds: t(clouds) };
}

function buildGlobe() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#05070b');
  const tx = earthTextures();
  const mat = new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: tx.day }, nightMap: { value: tx.night }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize((modelMatrix*vec4(normal,0.)).xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){ float d=dot(normalize(vN),normalize(sunDir)); float k=smoothstep(-0.12,0.22,d); vec3 dc=texture2D(dayMap,vUv).rgb*(0.55+0.65*max(d,0.)); vec3 nc=texture2D(nightMap,vUv).rgb*1.9; gl_FragColor=vec4(mix(nc,dc,k),1.); }',
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat); scene.add(earth);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 48), new THREE.MeshBasicMaterial({ map: tx.clouds, transparent: true, opacity: 0.35, depthWrite: false }));
  scene.add(clouds);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.09, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vN; void main(){ float i=pow(0.72-dot(vN,vec3(0.,0.,1.)),3.); gl_FragColor=vec4(0.48,0.55,1.0,1.)*i; }',
  }));
  scene.add(atmo);
  const sg = new THREE.BufferGeometry(); const sp = []; const rs = seeded(0.13);
  for (let i = 0; i < 1800; i++) { const v = new THREE.Vector3(rs() - 0.5, rs() - 0.5, rs() - 0.5).normalize().multiplyScalar(40 + rs() * 20); sp.push(v.x, v.y, v.z); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#c9cff5', size: 0.08, sizeAttenuation: true, transparent: true, opacity: 0.7 })));
  const marker = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: '#8b8dff' }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.024, 48), new THREE.MeshBasicMaterial({ color: '#8b8dff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  marker.add(dot, ring); scene.add(marker);
  return { scene, mat, clouds, marker, ring, earth };
}

// ---------- 街区（OSM 挤出） ----------
function windowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  const r = seeded(0.5);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (r() < 0.55) { g.fillStyle = `rgba(255,${200 + Math.floor(r() * 40)},140,${0.5 + r() * 0.5})`; g.fillRect(x * 16 + 4, y * 16 + 5, 8, 7); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 14, 1 / 14); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ribbon(points, width, y) {
  const pos = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, z1] = points[i], [x2, z2] = points[i + 1]; const dx = x2 - x1, dz = z2 - z1; const L = Math.hypot(dx, dz) || 1; const nx = (-dz / L) * width / 2, nz = (dx / L) * width / 2;
    pos.push(x1 + nx, y, z1 + nz, x2 + nx, y, z2 + nz, x2 - nx, y, z2 - nz, x1 + nx, y, z1 + nz, x2 - nx, y, z2 - nz, x1 - nx, y, z1 - nz);
  }
  return pos;
}
function polyShape(p) { const s = new THREE.Shape(); p.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z))); return s; }
const ROAD_W = { motorway: 22, trunk: 18, primary: 16, secondary: 12, tertiary: 10, residential: 7, unclassified: 7, service: 5, pedestrian: 6, footway: 2.5, path: 2, cycleway: 2.5, steps: 2 };
function buildCity(geo) {
  const scene = new THREE.Scene();
  const group = new THREE.Group(); scene.add(group);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#23272e', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'ground'; scene.add(ground);
  const grid = new THREE.GridHelper(2400, 48, '#2f343c', '#2a2e35'); grid.position.y = 0.05; scene.add(grid);
  const flat = (polys, color, y) => { for (const pk of polys) { if (pk.p.length < 3) continue; const m = new THREE.Mesh(new THREE.ShapeGeometry(polyShape(pk.p)), new THREE.MeshStandardMaterial({ color, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; group.add(m); } };
  flat(geo.water || [], '#1d3a55', 0.15); flat(geo.parks || [], '#24402c', 0.2);
  const major = [], minor = [];
  for (const r of geo.roads || []) { const w = ROAD_W[r.t] || 5; (w >= 7 ? major : minor).push(...ribbon(r.p, w, w >= 7 ? 0.35 : 0.3)); }
  for (const [arr, color] of [[major, '#3a3f48'], [minor, '#30353d']]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide })); m.receiveShadow = true; group.add(m); }
  const win = windowTexture();
  const side = new THREE.MeshStandardMaterial({ color: '#6f7887', roughness: 0.75, metalness: 0.15, emissive: '#ffcf8a', emissiveMap: win, emissiveIntensity: 0 });
  const sideTall = side.clone(); sideTall.color = new THREE.Color('#7d8aa0'); sideTall.metalness = 0.35; sideTall.roughness = 0.45;
  const roof = new THREE.MeshStandardMaterial({ color: '#555c67', roughness: 0.9 });
  const buildings = new THREE.Group(); group.add(buildings);
  for (const b of geo.buildings) {
    if (b.p.length < 3) continue;
    const h = b.h || 10 + hashN(JSON.stringify(b.p[0])) * 40;
    const g = new THREE.ExtrudeGeometry(polyShape(b.p), { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, [roof, h > 120 ? sideTall : side]); m.castShadow = true; m.receiveShadow = true; m.userData = { kind: 'building', name: b.n, h };
    buildings.add(m);
  }
  return { scene, group, buildings, ground, materials: { side, sideTall } };
}

// ---------- 天气粒子 ----------
function buildWeather(scene) {
  const N = 2400, pos = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 900, y = Math.random() * 420, z = (Math.random() - 0.5) * 900; pos.set([x, y, z, x - 0.6, y - 9, z], i * 6); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#9fb3d1', transparent: true, opacity: 0.35 })); rain.visible = false; scene.add(rain);
  const sp = new Float32Array(1600 * 3); for (let i = 0; i < 1600; i++) sp.set([(Math.random() - 0.5) * 900, Math.random() * 420, (Math.random() - 0.5) * 900], i * 3);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, transparent: true, opacity: 0.8 })); snow.visible = false; scene.add(snow);
  const cloudTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = seeded(0.3); for (let i = 0; i < 60; i++) { const x = 40 + r() * 176, y = 40 + r() * 176, rr = 20 + r() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); } return new THREE.CanvasTexture(c); })();
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.3, depthWrite: false, color: '#c9d2e3' })); m.rotation.x = -Math.PI / 2; m.position.set((Math.random() - 0.5) * 2400, 760 + Math.random() * 160, (Math.random() - 0.5) * 2400); clouds.add(m); }
  scene.add(clouds);
  return { rain, snow, clouds };
}

function personMesh(color, focus) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(focus ? 3.2 : 2.4, focus ? 6 : 4.4, 4, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: focus ? 0.5 : 0.18 }));
  body.position.y = focus ? 6.5 : 4.8; body.castShadow = true; g.add(body);
  if (focus) { const ring = new THREE.Mesh(new THREE.RingGeometry(7, 8.6, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; ring.name = 'ring'; g.add(ring); }
  return g;
}
function placeMesh(type) {
  const color = new THREE.Color(PLACE_META[type]?.color || '#9aa3b5');
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 160, 10, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 80; g.add(beam);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(12, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.7; g.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(12, 14, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.8; ring.name = 'ring'; g.add(ring);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 40, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 20; hit.name = 'hit'; g.add(hit);
  return g;
}

export default function Mirror3D({ geo, mirror, mode, onMode, focusColor = '#8b8dff', selected, onSelect, editTool, onEdit, flyKey, tiles, photoreal, onAttribution, onQuality, height = '100%' }) {
  const host = useRef(null), labelsRef = useRef(null);
  const st = useRef({});
  const [labels, setLabels] = useState([]);
  const props = useRef({}); props.current = { mirror, mode, onMode, selected, onSelect, editTool, onEdit, focusColor, onQuality };

  // 初始化：渲染器、两个场景、相机、控制器、动画循环
  useEffect(() => {
    const el = host.current; const S = st.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const globe = buildGlobe(), city = buildCity(geo);
    const [lat0, lon0] = geo.center;
    const anchorDir = llToVec(lat0, lon0).normalize();
    globe.marker.position.copy(anchorDir.clone().multiplyScalar(1.003)); globe.marker.lookAt(anchorDir.clone().multiplyScalar(2));
    const gcam = new THREE.PerspectiveCamera(40, 1, 0.01, 200); gcam.position.copy(anchorDir.clone().multiplyScalar(3.4).add(new THREE.Vector3(0, 0.6, 0)));
    const ccam = new THREE.PerspectiveCamera(45, 1, 1, 20000); ccam.position.set(0, 1800, 1500);
    const gctl = new OrbitControls(gcam, renderer.domElement); gctl.enableDamping = true; gctl.enablePan = false; gctl.minDistance = 1.18; gctl.maxDistance = 7; gctl.rotateSpeed = 0.5;
    const cctl = new OrbitControls(ccam, renderer.domElement); cctl.enableDamping = true; cctl.maxPolarAngle = Math.PI * 0.47; cctl.minDistance = 40; cctl.maxDistance = 3200; cctl.target.set(0, 0, 0);
    // 光照
    const hemi = new THREE.HemisphereLight('#9fb4d9', '#15181d', 0.5); city.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1dc', 1.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 10, far: 4000 }); sun.shadow.bias = -0.0005;
    city.scene.add(sun, sun.target);
    const moon = new THREE.DirectionalLight('#8aa2d8', 0.12); moon.position.set(-500, 800, 300); city.scene.add(moon);
    const wx = buildWeather(city.scene);
    city.scene.fog = new THREE.FogExp2('#0b0e13', 0.00025);
    const people = new THREE.Group(), places = new THREE.Group(); city.scene.add(people, places);
    Object.assign(S, { renderer, globe, city, gcam, ccam, gctl, cctl, hemi, sun, moon, wx, people, places, anchorDir, hour: props.current.mirror?.hour ?? 12, flight: null, fade: 0, fadeDir: 0, view: props.current.mode || 'globe', agents: new Map(), placeObjs: new Map(), raycaster: new THREE.Raycaster(), mouse: new THREE.Vector2(), flash: 0, last: performance.now() });
    gctl.enabled = S.view === 'globe'; cctl.enabled = S.view === 'street';
    if (S.view === 'street') { ccam.position.set(260, 520, 760); }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); for (const c of [gcam, ccam]) { c.aspect = w / Math.max(1, h); c.updateProjectionMatrix(); } };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    // 视角切换：地球 ⇄ 街区（缩放越过阈值自动触发）
    S.go = (target) => {
      if (S.transit || target === S.view) return;
      S.transit = true;
      if (target === 'street') {
        const from = gcam.position.clone(), to = anchorDir.clone().multiplyScalar(1.16);
        S.flight = { cam: gcam, ctl: gctl, from, to, tFrom: gctl.target.clone(), tTo: new THREE.Vector3(), t: 0, dur: reduce ? 0.01 : 1.4, done: () => {
          S.fadeDir = 1; S.afterFade = () => { S.view = 'street'; gctl.enabled = false; cctl.enabled = true; ccam.position.set(0, 2600, 1900); cctl.target.set(0, 0, 0);
            S.fadeDir = -1; S.flight = { cam: ccam, ctl: cctl, from: ccam.position.clone(), to: new THREE.Vector3(260, 520, 760), tFrom: new THREE.Vector3(), tTo: new THREE.Vector3(0, 0, 0), t: 0, dur: reduce ? 0.01 : 1.8, done: () => { S.transit = false; } };
            props.current.onMode?.('street'); };
        } };
      } else {
        S.fadeDir = 1; S.afterFade = () => { S.view = 'globe'; cctl.enabled = false; gctl.enabled = true; gcam.position.copy(anchorDir.clone().multiplyScalar(1.25)); gctl.target.set(0, 0, 0);
          S.fadeDir = -1; S.flight = { cam: gcam, ctl: gctl, from: gcam.position.clone(), to: anchorDir.clone().multiplyScalar(3.4).add(new THREE.Vector3(0, 0.6, 0)), tFrom: new THREE.Vector3(), tTo: new THREE.Vector3(), t: 0, dur: reduce ? 0.01 : 1.6, done: () => { S.transit = false; } };
          props.current.onMode?.('globe'); };
      }
    };
    S.flyToPoint = (x, z) => { if (S.view !== 'street') return; const tgt = new THREE.Vector3(x, 0, z); const off = ccam.position.clone().sub(cctl.target).normalize().multiplyScalar(Math.min(420, ccam.position.distanceTo(cctl.target))); S.flight = { cam: ccam, ctl: cctl, from: ccam.position.clone(), to: tgt.clone().add(off.setY(Math.max(off.y, 120))), tFrom: cctl.target.clone(), tTo: tgt, t: 0, dur: reduce ? 0.01 : 1.2 }; };

    // 拾取：点击居民/地点；编辑模式下点击地面
    const pick = (ev, commit) => {
      const r = renderer.domElement.getBoundingClientRect();
      S.mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      if (S.view === 'globe') {
        S.raycaster.setFromCamera(S.mouse, gcam); const hit = S.raycaster.intersectObject(globe.earth)[0];
        if (hit && commit && hit.point.clone().normalize().angleTo(anchorDir) < 0.12) S.go('street');
        renderer.domElement.style.cursor = hit && hit.point.clone().normalize().angleTo(anchorDir) < 0.12 ? 'pointer' : 'grab'; return;
      }
      S.raycaster.setFromCamera(S.mouse, ccam);
      const p = props.current;
      if (p.editTool) { const g = S.raycaster.intersectObject(city.ground)[0]; renderer.domElement.style.cursor = 'crosshair'; if (g && commit) p.onEdit?.({ ...p.editTool, x: Math.round(g.point.x), z: Math.round(g.point.z) }); return; }
      const objs = [...people.children, ...places.children];
      const hit = S.raycaster.intersectObjects(objs, true)[0];
      let o = hit?.object; while (o && !o.userData.pick) o = o.parent;
      renderer.domElement.style.cursor = o ? 'pointer' : 'grab';
      if (commit && o) p.onSelect?.(o.userData.pick);
    };
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) pick(e, true); down = null; };
    const onMove = (e) => { if (!down) pick(e, false); };
    renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp); renderer.domElement.addEventListener('pointermove', onMove);

    const tmpV = new THREE.Vector3();
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
      // 自适应画质：前 3 秒平均帧率低于 24 时关闭阴影并降低像素比（集成显卡 / 软件渲染）
      S.q = S.q || { t0: now, n: 0, done: false }; if (!S.q.done) { S.q.n++; if (now - S.q.t0 > 3000) { S.q.done = true; const fps = (S.q.n * 1000) / (now - S.q.t0); if (fps < 24) { renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; S.sun.castShadow = false; city.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((mm) => { mm.needsUpdate = true; }); }); S.lowQuality = true; props.current.onQuality?.('low'); } } }
      const m = props.current.mirror;
      // 时间平滑：显示小时向世界小时逼近（跨午夜取最短方向）
      if (m) { const d = ((m.hour - S.hour + 36) % 24) - 12; S.hour = Math.abs(d) > 2 ? m.hour : (S.hour + d * Math.min(1, dt * 1.5) + 24) % 24; }
      const season = m?.sun ? (m.sun.declination / 23.44) : 0;
      // 太阳：按显示小时重算高度角/方位角
      const decl = (m?.sun?.declination ?? 0) * DEG, la = lat0 * DEG, ha = (S.hour - 12) * 15 * DEG;
      const alt = Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha));
      const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) + Math.PI;
      const dayF = THREE.MathUtils.smoothstep(alt / DEG, -8, 10), w = m?.weather || { cloud: 0.2, fog: 0.05, rain: 0, snow: 0 };
      // 地球：太阳直射点
      const subLon = lon0 - (S.hour - 12) * 15; globe.mat.uniforms.sunDir.value.copy(llToVec(m?.sun?.declination ?? 0, subLon)); globe.clouds.material.opacity = 0.18 + w.cloud * 0.45; globe.clouds.rotation.y += dt * 0.004;
      const pulse = 1 + 0.35 * Math.sin(now / 380); globe.ring.scale.setScalar(pulse); globe.ring.material.opacity = 0.9 - (pulse - 0.65) * 0.8;
      // 街区：天光、阳光、雾、窗灯、闪电
      const sunDir = new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
      S.sun.position.copy(sunDir.clone().multiplyScalar(2000)); S.sun.intensity = 1.7 * dayF * (1 - w.cloud * 0.65); S.sun.visible = alt > -0.02;
      const night = new THREE.Color('#05070c'), dusk = new THREE.Color('#2a1d2e'), dayC = new THREE.Color('#5d7898'), grey = new THREE.Color('#59616c');
      const twi = 1 - Math.min(1, Math.abs(alt / DEG) / 9);
      const sky = night.clone().lerp(dayC, dayF).lerp(dusk, twi * 0.55).lerp(grey, w.cloud * 0.5 * dayF);
      city.scene.background = sky; city.scene.fog.color.copy(sky); city.scene.fog.density = 0.00018 + w.fog * 0.0016;
      S.flash = w.lightning && Math.random() < dt * 0.35 ? 1 : Math.max(0, S.flash - dt * 6);
      S.hemi.intensity = 0.38 + 0.5 * dayF * (1 - w.cloud * 0.3) + S.flash * 2.2; S.moon.intensity = 0.4 * (1 - dayF);
      const wi = (1 - dayF) * 0.85 + w.cloud * 0.08; city.materials.side.emissiveIntensity = wi; city.materials.sideTall.emissiveIntensity = wi * 0.8;
      wx.rain.visible = S.view === 'street' && w.rain > 0; wx.snow.visible = S.view === 'street' && w.snow > 0;
      for (const c of wx.clouds.children) { c.material.opacity = w.cloud * 0.55; c.position.x += dt * 6; if (c.position.x > 1300) c.position.x = -1300; }
      if (wx.rain.visible && !reduce) { const a = wx.rain.geometry.attributes.position; for (let i = 0; i < a.count; i += 2) { let y = a.getY(i) - dt * 260; if (y < 0) y += 420; a.setY(i, y); a.setY(i + 1, y - 9); } a.needsUpdate = true; wx.rain.position.set(cctl.target.x, 0, cctl.target.z); }
      if (wx.snow.visible && !reduce) { const a = wx.snow.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 28; if (y < 0) y += 420; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(now / 900 + i) * dt * 4); } a.needsUpdate = true; wx.snow.position.set(cctl.target.x, 0, cctl.target.z); }
      // 居民移动：朝目标地点行走（直线插值），到达后原地轻微晃动
      for (const [id, a] of S.agents) {
        tmpV.copy(a.target).sub(a.obj.position); const dist = tmpV.length();
        const spd = reduce ? 1e6 : 60 + dist * 0.8;
        if (dist > 0.5) { a.obj.position.add(tmpV.normalize().multiplyScalar(Math.min(dist, spd * dt))); a.obj.children[0].position.y = (a.focus ? 6.5 : 4.8) + Math.abs(Math.sin(now / 120 + a.phase)) * 1.2; }
        const ring = a.obj.getObjectByName('ring'); if (ring) { const k = 1 + 0.15 * Math.sin(now / 300); ring.scale.setScalar(k); }
      }
      for (const [, o] of S.placeObjs) { const ring = o.getObjectByName('ring'); if (ring) ring.material.opacity = o.userData.sel ? 0.6 + 0.4 * Math.sin(now / 200) : 0.55; }
      // 相机飞行（easeInOutCubic）
      if (S.flight) { const f = S.flight; f.t = Math.min(1, f.t + dt / f.dur); const k = ease(f.t); f.cam.position.lerpVectors(f.from, f.to, k); f.ctl.target.lerpVectors(f.tFrom, f.tTo, k); if (f.t >= 1) { S.flight = null; f.done?.(); } }
      // 淡入淡出过场
      if (S.fadeDir) { S.fade = THREE.MathUtils.clamp(S.fade + S.fadeDir * dt * (reduce ? 100 : 3.2), 0, 1); if (S.fade >= 1 && S.fadeDir > 0) { S.fadeDir = 0; S.afterFade?.(); S.afterFade = null; } if (S.fade <= 0 && S.fadeDir < 0) S.fadeDir = 0; if (S.fadeEl) S.fadeEl.style.opacity = S.fade; }
      // 缩放越过阈值：地球 → 街区，街区 → 地球
      if (!S.transit) { if (S.view === 'globe' && gcam.position.length() < 1.3) S.go('street'); if (S.view === 'street' && ccam.position.distanceTo(cctl.target) > 3000) S.go('globe'); }
      (S.view === 'globe' ? gctl : cctl).update();
      if (S.tiles && S.view === 'street') { S.tiles.setCamera(ccam); S.tiles.setResolutionFromRenderer(ccam, renderer); ccam.updateMatrixWorld(); S.tiles.update(); }
      const cam = S.view === 'globe' ? gcam : ccam;
      renderer.render(S.view === 'globe' ? globe.scene : city.scene, cam);
      // 标签：每帧把 3D 坐标投影到屏幕
      const box = labelsRef.current; if (box) {
        const W = el.clientWidth, H = el.clientHeight;
        for (const node of box.children) {
          const key = node.dataset.key; let pos = null;
          if (key === 'anchor') { if (S.view === 'globe') pos = globe.marker.position.clone(); }
          else if (S.view === 'street') { const a = S.agents.get(key) || S.placeObjs.get(key); if (a) pos = (a.obj || a).position.clone().setY(node.dataset.kind === 'person' ? 20 : 30); }
          if (!pos) { node.style.opacity = 0; continue; }
          const v = pos.project(cam); const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
          if (key === 'anchor' && vis) { const toCam = gcam.position.clone().normalize(); if (toCam.dot(anchorDir) < 0.15) { node.style.opacity = 0; continue; } }
          const dcam = S.view === 'street' ? cam.position.distanceTo(pos) : 0;
          const far = node.dataset.kind === 'place' && dcam > 1500 && node.dataset.sel !== '1';
          node.style.opacity = vis && !far ? 1 : 0;
          node.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -100%)`;
        }
      }
    };
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp); renderer.domElement.removeEventListener('pointermove', onMove); gctl.dispose(); cctl.dispose(); S.tiles?.dispose?.(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, [geo]);

  // 外部切换视角
  useEffect(() => { const S = st.current; if (S.go && mode && mode !== S.view) S.go(mode); }, [mode]);

  // 地点与居民同步（增量更新，不重建场景）
  useEffect(() => {
    const S = st.current; if (!S.places || !mirror) return;
    const pk = new Set(mirror.places.map((p) => p.id));
    for (const [id, o] of S.placeObjs) if (!pk.has(id)) { S.places.remove(o); S.placeObjs.delete(id); }
    for (const p of mirror.places) {
      let o = S.placeObjs.get(p.id);
      if (!o || o.userData.type !== p.type) { if (o) S.places.remove(o); o = placeMesh(p.type); o.userData = { pick: { kind: 'place', id: p.id }, type: p.type }; S.places.add(o); S.placeObjs.set(p.id, o); }
      o.position.set(p.x, 0, p.z); o.userData.sel = selected?.kind === 'place' && selected.id === p.id;
    }
    const byId = new Map(mirror.places.map((p) => [p.id, p]));
    const ids = new Set(mirror.people.map((p) => p.id));
    for (const [id, a] of S.agents) if (!ids.has(id)) { S.people.remove(a.obj); S.agents.delete(id); }
    for (const p of mirror.people) {
      let a = S.agents.get(p.id);
      const color = p.focus ? props.current.focusColor : p.lineage ? '#c9cbe0' : '#6b7280';
      if (!a || a.focus !== p.focus || a.lineage !== p.lineage) { if (a) S.people.remove(a.obj); const obj = personMesh(color, p.focus); obj.userData = { pick: { kind: 'person', id: p.id } }; S.people.add(obj); const pl0 = byId.get(p.place); if (pl0) obj.position.set(pl0.x, 0, pl0.z); a = { obj, focus: p.focus, lineage: p.lineage, phase: hashN(p.id) * 10, target: new THREE.Vector3() }; S.agents.set(p.id, a); }
      const pl = byId.get(p.place); if (pl) { const ang = hashN(p.id + 'a') * Math.PI * 2, rad = p.focus ? 0 : 16 + hashN(p.id + 'r') * 18; a.target.set(pl.x + Math.cos(ang) * rad, 0, pl.z + Math.sin(ang) * rad); }
    }
    setLabels([
      { key: 'anchor', kind: 'anchor' },
      ...mirror.places.map((p) => ({ key: p.id, kind: 'place', type: p.type, name: p.name, virtual: p.virtual, custom: p.custom })),
      ...mirror.people.filter((p) => p.focus || (selected?.kind === 'person' && selected.id === p.id)).map((p) => ({ key: p.id, kind: 'person', name: p.name, focus: p.focus, stage: p.stage })),
    ]);
  }, [mirror, selected]);

  // 选中后飞过去
  useEffect(() => {
    const S = st.current; if (!S.flyToPoint || !selected || !mirror) return;
    if (selected.kind === 'place') { const p = mirror.places.find((x) => x.id === selected.id); if (p) S.flyToPoint(p.x, p.z); }
    if (selected.kind === 'person') { const a = S.agents.get(selected.id); if (a) S.flyToPoint(a.target.x, a.target.z); }
  }, [selected?.id, flyKey]);

  // 可选：真实感 3D 瓦片（Google Photorealistic 3D Tiles 或 Cesium ion）。需要用户自己的密钥。
  useEffect(() => {
    const S = st.current; if (!S.city) return;
    if (!photoreal || !(tiles?.googleKey || tiles?.cesiumIonToken)) { if (S.tiles) { S.city.scene.remove(S.tiles.group); S.tiles.dispose(); S.tiles = null; S.city.buildings.visible = true; } return; }
    let cancelled = false;
    (async () => {
      try {
        const [{ TilesRenderer }, plugins, { DRACOLoader }] = await Promise.all([import('3d-tiles-renderer'), import('3d-tiles-renderer/plugins'), import('three/examples/jsm/loaders/DRACOLoader.js')]);
        if (cancelled) return;
        const t = new TilesRenderer();
        if (tiles.googleKey) t.registerPlugin(new plugins.GoogleCloudAuthPlugin({ apiToken: tiles.googleKey, autoRefreshToken: true }));
        else t.registerPlugin(new plugins.CesiumIonAuthPlugin({ apiToken: tiles.cesiumIonToken, assetId: String(tiles.cesiumAssetId || 96188), autoRefreshToken: true }));
        const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        t.registerPlugin(new plugins.GLTFExtensionsPlugin({ dracoLoader: draco }));
        t.registerPlugin(new plugins.ReorientationPlugin({ lat: geo.center[0] * DEG, lon: geo.center[1] * DEG, height: 0, up: '+y', recenter: true }));
        S.city.scene.add(t.group); S.tiles = t; S.city.buildings.visible = false;
        const tick = setInterval(() => { if (!S.tiles) return clearInterval(tick); const at = S.tiles.getAttributions().map((a) => (typeof a.value === 'string' ? a.value : '')).filter(Boolean); onAttribution?.(at.join(' · ')); }, 2000);
      } catch (e) { onAttribution?.(`3D 瓦片加载失败：${e.message}`); }
    })();
    return () => { cancelled = true; };
  }, [photoreal, tiles?.googleKey, tiles?.cesiumIonToken]);

  return (
    <div className="mirror3d" style={{ height }}>
      <div ref={host} className="mirror-canvas" />
      <div className="mirror-fade" ref={(n) => { st.current.fadeEl = n; }} />
      <div ref={labelsRef} className="mirror-labels" aria-hidden="true">
        {labels.map((l) => {
          if (l.kind === 'anchor') return <div key="anchor" data-key="anchor" data-kind="anchor" className="ml ml-anchor"><MapPin size={12} />{geo.name}</div>;
          if (l.kind === 'person') return <div key={l.key} data-key={l.key} data-kind="person" className={`ml ml-person ${l.focus ? 'focus' : ''}`}>{l.focus ? <Crown size={11} /> : <User size={11} />}{l.name}<span>{l.stage}</span></div>;
          const M = PLACE_META[l.type] || PLACE_META.home; const I = M.icon; const sel = selected?.kind === 'place' && selected.id === l.key;
          return <div key={l.key} data-key={l.key} data-kind="place" data-sel={sel ? '1' : '0'} className={`ml ml-place ${sel ? 'sel' : ''}`} style={{ '--pc': M.color }}><I size={11} />{l.name}</div>;
        })}
      </div>
    </div>
  );
}
