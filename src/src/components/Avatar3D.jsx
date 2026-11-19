import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// 镜头预设与上一次位姿（切换视图时从上一位姿平滑过渡）
const PRESETS = { full: { pos: [0.6, 1.45, 6.2], target: [0, 1.05, 0], fov: 28 }, portrait: { pos: [0.35, 1.95, 3.1], target: [0, 1.82, 0], fov: 24 } };
let lastPose = null;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// 由 DNA.appearance 程序化生成的风格化人像，摄影棚式柔光舞台
export default function Avatar3D({ appearance, seed, height = 360, interactive = true, preset = 'full' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el || !appearance) return;
    const w = el.clientWidth || 400, h = el.clientHeight || height;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { el.innerHTML = '<div class="chart-empty">WebGL 不可用</div>'; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const P = PRESETS[preset] || PRESETS.full;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = lastPose || { pos: [P.pos[0] * 1.6 + 1.2, P.pos[1] + 0.5, P.pos[2] * 1.5], target: P.target, fov: P.fov };
    const cam = new THREE.PerspectiveCamera(from.fov, w / h, 0.1, 100); cam.position.set(...from.pos);
    const tgt = new THREE.Vector3(...from.target);
    const ease = { t0: performance.now(), dur: reduce ? 0 : 1400, from, to: P, done: reduce };

    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1b22, 0.55));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.2); key.position.set(2.5, 4.5, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 8; key.shadow.camera.near = 1; key.shadow.camera.far = 15;
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 }); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcc8ff, 0.6); fill.position.set(-3, 2, 2); scene.add(fill);
    const accent = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c7fff');
    const rim = new THREE.DirectionalLight(accent, 1.6); rim.position.set(-1.5, 3, -3.5); scene.add(rim);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.06, 64), new THREE.MeshPhysicalMaterial({ color: 0x1b1d24, roughness: 0.35, metalness: 0.2, clearcoat: 0.6 }));
    disc.position.y = 0.03; disc.receiveShadow = true; scene.add(disc);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.975, 0.006, 8, 128), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.6 }));
    edge.rotation.x = Math.PI / 2; edge.position.y = 0.061; scene.add(edge);

    const a = appearance;
    const tall = 0.88 + a.body_height * 0.24, build = 0.85 + a.body_build * 0.35;
    const skin = new THREE.Color().setHSL(a.skin_hue, 0.42, a.skin_light ?? 0.6);
    const hair = new THREE.Color().setHSL(a.hair_hue, 0.35, 0.22);
    const outfitHue = { techwear: 0.62, hoodie: 0.7, 'lab-coat': 0.58, 'kimono-modern': 0.98, 'flight-jacket': 0.08, 'minimal-suit': 0.62 }[a.outfit] ?? 0.62;
    const light = a.outfit === 'lab-coat';
    const outfit = new THREE.Color().setHSL(outfitHue, light ? 0.04 : 0.18, light ? 0.82 : 0.2);
    const M = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.6, metalness: 0, sheen: 0.3, ...o });
    const skinM = M(skin, { roughness: 0.5, clearcoat: 0.15, sheen: 0 });

    const fig = new THREE.Group(); fig.position.y = 0.06; fig.scale.set(build, tall, build); scene.add(fig);
    const add = (geo, mat, pos, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = true; fig.add(m); return m; };
    add(new THREE.CapsuleGeometry(0.34, 0.66, 12, 24), M(outfit), [0, 1.15, 0]);
    add(new THREE.TorusGeometry(0.345, 0.018, 8, 48), M(accent, { roughness: 0.3, metalness: 0.4 }), [0, 0.92, 0], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.125, 0.6, 8, 16), M(outfit.clone().offsetHSL(0, 0, -0.05)), [0.16 * s, 0.42, 0]);
      add(new THREE.CapsuleGeometry(0.095, 0.6, 8, 16), M(outfit), [0.47 * s, 1.15, 0], [0, 0, 0.1 * s]);
      add(new THREE.SphereGeometry(0.085, 20, 20), skinM, [0.51 * s, 0.76, 0]);
      add(new THREE.BoxGeometry(0.17, 0.08, 0.28), M(0x16171c, { roughness: 0.4 }), [0.16 * s, 0.04, 0.04]);
    }
    const headG = new THREE.Group(); headG.position.y = 1.86; fig.add(headG);
    const hadd = (geo, mat, pos, rot, sc) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); if (sc) m.scale.set(...sc); m.castShadow = true; headG.add(m); return m; };
    hadd(new THREE.CylinderGeometry(0.085, 0.095, 0.16, 20), skinM, [0, -0.2, 0]);
    hadd(new THREE.SphereGeometry(0.24, 48, 48), skinM, [0, 0, 0], null, [1, 1.12, 1.02]);
    const eyeM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(a.eye_hue, 0.5, 0.18), roughness: 0.1, clearcoat: 1 });
    for (const s of [-1, 1]) hadd(new THREE.SphereGeometry(0.028, 16, 16), eyeM, [0.085 * s, 0.02, 0.215]);
    const hm = M(hair, { roughness: 0.45, sheen: 0.8, sheenColor: new THREE.Color(0xffffff) });
    const st = a.hair_style;
    hadd(new THREE.SphereGeometry(0.255, 48, 24, 0, Math.PI * 2, 0, Math.PI * (st === 2 ? 0.38 : 0.56)), hm, [0, 0.035, -0.01], [-0.28, 0, 0], [1, 1.1, 1.03]);
    if (st === 1) hadd(new THREE.CylinderGeometry(0.25, 0.2, 0.5, 32, 1, true, Math.PI * 0.55, Math.PI * 0.9), hm, [0, -0.14, -0.02], [0, Math.PI, 0]).material.side = THREE.DoubleSide;
    if (st === 2) for (let i = 0; i < 6; i++) hadd(new THREE.ConeGeometry(0.045, 0.16, 12), hm, [0, 0.27 - i * 0.005, -0.1 + i * 0.045], [-0.5 + i * 0.18, 0, 0]);
    if (st === 3) hadd(new THREE.SphereGeometry(0.1, 24, 24), hm, [0, 0.2, -0.2]);
    if (st === 4) hadd(new THREE.CapsuleGeometry(0.055, 0.34, 8, 12), hm, [0, -0.08, -0.27], [0.3, 0, 0]);

    let controls;
    if (interactive) {
      controls = new OrbitControls(cam, renderer.domElement);
      controls.target.copy(tgt); controls.enableDamping = true; controls.enablePan = false;
      controls.minDistance = 3.5; controls.maxDistance = 9; controls.minPolarAngle = 0.9; controls.maxPolarAngle = 1.65;
      controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.6; controls.enabled = false;
    } else cam.lookAt(tgt);

    let raf; const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      headG.rotation.y = Math.sin(t * 0.7) * 0.12; headG.rotation.x = Math.sin(t * 0.5) * 0.03;
      fig.scale.y = tall * (1 + Math.sin(t * 1.4) * 0.004);
      if (!ease.done) {
        const k = ease.dur ? easeOutCubic(Math.min(1, (performance.now() - ease.t0) / ease.dur)) : 1;
        const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * k);
        cam.position.set(...lerp(ease.from.pos, ease.to.pos)); tgt.set(...lerp(ease.from.target, ease.to.target));
        cam.fov = ease.from.fov + (ease.to.fov - ease.from.fov) * k; cam.updateProjectionMatrix();
        if (controls) controls.target.copy(tgt); else cam.lookAt(tgt);
        if (k >= 1) { ease.done = true; if (controls) controls.enabled = true; }
      }
      if (controls && ease.done) controls.update(); else if (controls) cam.lookAt(tgt);
      lastPose = { pos: cam.position.toArray(), target: tgt.toArray(), fov: cam.fov };
      renderer.render(scene, cam); raf = requestAnimationFrame(tick);
    };
    tick();
    const ro = new ResizeObserver(() => { const W = el.clientWidth, H = el.clientHeight; if (W && H) { renderer.setSize(W, H); cam.aspect = W / H; cam.updateProjectionMatrix(); } });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); controls?.dispose(); pmrem.dispose(); renderer.dispose(); el.innerHTML = ''; };
  }, [seed]);
  return <div ref={ref} className="stage" style={{ height }} />;
}
