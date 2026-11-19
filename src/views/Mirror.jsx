import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe2, Building, Sun, Moon, CloudSun, Cloud, CloudRain, CloudLightning, CloudFog, Snowflake, Thermometer, Crosshair, Plus, Move, Trash2, X, Users, Layers, Info, Navigation, Crown, Network, Sparkles } from 'lucide-react';
import Mirror3D, { PLACE_META } from '../components/Mirror3D.jsx';
import { Card, Segmented, MButton, Badge } from '../components/ui.jsx';
import { spring } from '../components/motion.jsx';

const api = typeof window !== 'undefined' ? window.alos : null;
let mirrorCache = null;
const WICON = { 晴: Sun, 多云: CloudSun, 阴: Cloud, 小雨: CloudRain, 雷雨: CloudLightning, 雾: CloudFog, 雪: Snowflake };
const SEASON = (s) => ['冬', '春', '夏', '秋'][Math.floor(((s + 1 / 24) % 1) * 4)] ?? '春';
const TYPE_LABEL = { home: '在家', work: '工作', shop: '购物用餐', school: '上学', park: '公园', hospital: '就医', culture: '文化活动', farm: '农场' };

export default function Mirror({ s, mv, c, godMode, setView, mirrorMode, setMirrorMode }) {
  const [meta, setMeta] = useState(mirrorCache);
  const [sel, setSel] = useState(null);
  // 允许外部（新手引导、冒烟测试）请求选中主角所在地点
  useEffect(() => {
    const h = () => { const f = s.life?.mirror?.people?.find((p) => p.focus); if (f) { setSel({ kind: 'place', id: f.place }); setFlyKey((k) => k + 1); } };
    window.addEventListener('alos-mirror-select', h); return () => window.removeEventListener('alos-mirror-select', h);
  }, [s.life]);
  const [flyKey, setFlyKey] = useState(0);
  const [quality, setQuality] = useState('high');
  const [tool, setTool] = useState(null);
  const [addType, setAddType] = useState('hospital');
  const [photoreal, setPhotoreal] = useState(false);
  const [attrib, setAttrib] = useState('');
  const [rename, setRename] = useState('');
  useEffect(() => { if (!mirrorCache && api?.mirror) api.mirror().then((m) => { mirrorCache = m; setMeta(m); }); }, []);
  useEffect(() => { if (!godMode) setTool(null); }, [godMode]);
  const life = s.life, m = life?.mirror;
  const world = mv.worlds.find((w) => w.worldId === mv.activeId);
  const place = sel?.kind === 'place' ? m?.places.find((p) => p.id === sel.id) : null;
  const person = sel?.kind === 'person' ? m?.people.find((p) => p.id === sel.id) : null;
  const placeOf = (id) => m?.places.find((p) => p.id === id);
  const counts = useMemo(() => { const o = {}; for (const p of m?.places || []) o[p.type] = (o[p.type] || 0) + 1; return o; }, [m?.places]);
  if (!meta || !m) return <div className="view single"><Card title="镜像世界" icon={Globe2}><div className="chart-empty">正在载入地理数据…</div></Card></div>;
  const night = m.sun.altitude < -4; const W = m.weather.kind === '晴' && night ? Moon : WICON[m.weather.kind] || Cloud;
  const hh = Math.floor(m.hour), mm = Math.round((m.hour - hh) * 60);
  const doEdit = async (op) => { const r = await c('editPlace', op); if (!r?.error && op.op === 'add') setTool(null); if (op.op === 'move') setTool(null); if (op.op === 'remove') setSel(null); };
  const hasTiles = !!(meta.tiles?.googleKey || meta.tiles?.cesiumIonToken);
  const here = place ? m.people.filter((p) => p.place === place.id) : [];

  return (
    <div className="view mirror">
      <div className="mirror-stage">
        <Mirror3D onQuality={setQuality} geo={meta.geo} mirror={m} mode={mirrorMode} onMode={setMirrorMode} focusColor={world?.color || '#8b8dff'} selected={sel} onSelect={(x) => { setSel(x); setFlyKey((k) => k + 1); }}
          editTool={godMode ? tool : null} onEdit={doEdit} flyKey={flyKey} tiles={meta.tiles} photoreal={photoreal} onAttribution={setAttrib} />
        <div className="mirror-top">
          <Segmented id="mmode" value={mirrorMode} onChange={setMirrorMode} options={[['globe', <><Globe2 size={13} />地球</>], ['street', <><Building size={13} />街区</>]]} />
          <div className="crumbs glass"><span>地球</span><i>/</i><span>{meta.geo.name}</span>{mirrorMode === 'street' && <><i>/</i><span>街区</span></>}</div>
          <div className="grow" />
          <motion.div className="wx-chip glass" layout transition={spring}>
            <W size={15} /><b>{m.weather.kind}</b><span className="num"><Thermometer size={12} />{m.weather.tempC}°C</span>
            <span className="num">{String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}</span><span>纪元 {life.yearInt} 年 · {SEASON(life.season)}</span>
            <span className="muted">太阳高度 {m.sun.altitude}°</span>
          </motion.div>
        </div>
        {godMode && (
          <div className="mirror-tools glass">
            <span className="tl"><Sparkles size={13} />God Mode · 编辑地点</span>
            <select value={addType} onChange={(e) => setAddType(e.target.value)} aria-label="地点类型">{Object.entries(PLACE_META).map(([k, v]) => <option key={k} value={k}>{v.zh}</option>)}</select>
            <MButton className={tool?.op === 'add' ? 'primary' : 'ghost'} onClick={() => { if (mirrorMode !== 'street') setMirrorMode('street'); setTool(tool?.op === 'add' ? null : { op: 'add', type: addType }); }}><Plus size={14} />{tool?.op === 'add' ? '点击地面放置…' : '新建'}</MButton>
            {tool && <MButton className="ghost" onClick={() => setTool(null)} title="取消"><X size={14} /></MButton>}
          </div>
        )}
        <div className="mirror-legend glass">
          {Object.entries(PLACE_META).map(([k, v]) => { const I = v.icon; return <span key={k} style={{ '--pc': v.color }}><I size={12} />{v.zh}<b className="num">{counts[k] || 0}</b></span>; })}
        </div>
        <div className="mirror-attrib">地理数据 {meta.geo.source}（{meta.geo.fetched}）· 地球轮廓 Natural Earth（公有领域）{attrib && ` · ${attrib}`}</div>
      </div>

      <div className="mirror-side">
        <AnimatePresence mode="popLayout" initial={false}>
          {place && (
            <motion.div key={'pl' + place.id} variants={{ hidden: { opacity: 0, x: 16 }, show: { opacity: 1, x: 0 } }} initial="hidden" animate="show" exit={{ opacity: 0, x: 16 }} transition={spring}>
              <Card title="地点" icon={PLACE_META[place.type]?.icon || Building} actions={<button className="link" onClick={() => setSel(null)} aria-label="关闭"><X size={14} /></button>}>
                <div className="insp-h"><i className="pdot" style={{ background: PLACE_META[place.type]?.color }} /><b>{place.name}</b></div>
                <div className="insp-tags"><Badge>{PLACE_META[place.type]?.zh}</Badge>{place.osm && <Badge tone="pos">OSM 真实建筑</Badge>}{place.virtual && <Badge tone="warn">镜像补全</Badge>}{place.custom && <Badge tone="accent">观察者新建</Badge>}</div>
                <dl className="kv mt"><dt>坐标</dt><dd className="num">x {place.x} · z {place.z} m</dd><dt>此刻在场</dt><dd>{here.length} 人</dd></dl>
                <p className="muted small mt">{meta.placeTypes?.[place.type]?.desc}</p>
                {here.length > 0 && <ul className="mini-list">{here.slice(0, 8).map((p) => <li key={p.id} onClick={() => setSel({ kind: 'person', id: p.id })}>{p.focus ? <Crown size={12} /> : <Users size={12} />}{p.name}<span className="muted">{p.stage}</span></li>)}</ul>}
                <div className="btnrow mt"><MButton className="ghost" onClick={() => setFlyKey((k) => k + 1)}><Navigation size={14} />飞到这里</MButton></div>
                {godMode && (
                  <div className="god-edit mt">
                    <div className="inputrow"><input value={rename} placeholder="新名称" onChange={(e) => setRename(e.target.value)} /><MButton className="ghost" disabled={!rename.trim()} onClick={() => { doEdit({ op: 'rename', id: place.id, name: rename.trim() }); setRename(''); }}>改名</MButton></div>
                    <div className="btnrow"><MButton className={tool?.op === 'move' ? 'primary' : 'ghost'} onClick={() => setTool(tool?.op === 'move' ? null : { op: 'move', id: place.id })}><Move size={14} />{tool?.op === 'move' ? '点击地面…' : '移动'}</MButton><MButton className="ghost danger" onClick={() => doEdit({ op: 'remove', id: place.id })}><Trash2 size={14} />拆除</MButton></div>
                  </div>
                )}
              </Card>
            </motion.div>
          )}
          {person && (
            <motion.div key={'pp' + person.id} variants={{ hidden: { opacity: 0, x: 16 }, show: { opacity: 1, x: 0 } }} initial="hidden" animate="show" exit={{ opacity: 0, x: 16 }} transition={spring}>
              <Card title="居民" icon={person.focus ? Crown : Users} actions={<button className="link" onClick={() => setSel(null)} aria-label="关闭"><X size={14} /></button>}>
                <div className="insp-h"><b>{person.name}</b>{person.focus && <Badge tone="accent">主角</Badge>}{person.lineage && !person.focus && <Badge>血脉</Badge>}</div>
                <dl className="kv mt"><dt>人生阶段</dt><dd>{person.stage} · {person.age} 岁</dd><dt>此刻</dt><dd>{TYPE_LABEL[person.type] || person.type} · {placeOf(person.place)?.name}</dd><dt>健康</dt><dd>{person.sick ? '患病' : '良好'}</dd></dl>
                <div className="btnrow mt"><MButton className="ghost" onClick={() => setFlyKey((k) => k + 1)}><Crosshair size={14} />跟随镜头</MButton><MButton className="ghost" onClick={() => setView('life')}><Network size={14} />家谱</MButton></div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        {!sel && (
          <Card title="居民动态" icon={Users} className="grow" pad={false} actions={<span className="muted small">{m.people.length} / {life.population} 人</span>}>
            <ul className="res-list">
              {m.people.slice(0, 40).map((p) => { const pl = placeOf(p.place); const M = PLACE_META[pl?.type] || PLACE_META.home; const I = M.icon; return (
                <li key={p.id} onClick={() => { if (mirrorMode !== 'street') setMirrorMode('street'); setSel({ kind: 'person', id: p.id }); setFlyKey((k) => k + 1); }} className={p.focus ? 'focus' : ''}>
                  <span className="rl-ic" style={{ '--pc': M.color }}><I size={12} /></span><span className="rl-n">{p.name}</span><span className="muted small">{p.stage}</span><span className="rl-p muted small">{pl?.name}</span>
                </li>); })}
            </ul>
          </Card>
        )}
        <Card title="数据与图层" icon={Layers}>
          <dl className="kv"><dt>街区</dt><dd>{meta.geo.buildings.length} 栋 OSM 建筑 · {meta.geo.roads.length} 条道路</dd><dt>锚点</dt><dd className="num">{meta.geo.center.map((v) => v.toFixed(4)).join(', ')}</dd><dt>平行世界</dt><dd>每个世界有独立的镜像状态</dd></dl>
          <div className="muted small mt">画质：{quality === 'low' ? '自适应已降级（帧率不足，已关闭阴影）' : '高（实时阴影）'}</div>
          <label className={`toggle mt ${hasTiles ? '' : 'disabled'}`}><input type="checkbox" disabled={!hasTiles} checked={photoreal} onChange={(e) => setPhotoreal(e.target.checked)} /><span>真实感 3D 瓦片{meta.tiles?.googleKey ? '（Google）' : meta.tiles?.cesiumIonToken ? '（Cesium ion）' : ''}</span></label>
          {!hasTiles && <p className="muted small"><Info size={12} /> 可选：在 .env 设置 ALOS_GOOGLE_TILES_KEY 或 ALOS_CESIUM_ION_TOKEN 后启用。默认使用离线 OSM 挤出模型，无需任何密钥。</p>}
          {meta.customAnchor && <p className="muted small">{meta.customAnchor.ok ? `自定义锚点已从 Overpass 载入${meta.customAnchor.cached ? '（缓存）' : ''}` : `自定义锚点下载失败，已回退到随包数据：${meta.customAnchor.error}`}</p>}
        </Card>
      </div>
    </div>
  );
}
