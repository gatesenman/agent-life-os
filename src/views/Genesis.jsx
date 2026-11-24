import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Orbit, Scale, Users, Sprout, Bug, CloudLightning, Sun, Sparkles, Handshake, Ban,
  Info, Zap, Hourglass, Trees, Utensils, GitFork, MessageCircle,
  Globe2, Layers, Activity, BookOpen, Building2,
} from 'lucide-react';
import { Card, Stat, Segmented, MButton, Badge, Meter } from '../components/ui.jsx';
import { spring } from '../components/motion.jsx';
import { ForkPanel } from './Multiverse.jsx';
import TalkPanel from '../components/TalkPanel.jsx';

const GOD = [
  ['plague', '降下瘟疫', Bug],
  ['disaster', '降下天灾', CloudLightning],
  ['bounty', '风调雨顺', Sun],
  ['insight', '赐予灵感', Sparkles],
  ['peace', '调停冲突', Handshake],
];
const ERA = { primitive: '原始时代', agrarian: '农业时代', industrial: '工业时代', information: '信息时代' };
const GROUPS = {
  earth: ['yearsPerDay', 'climateSensitivity', 'resourceRegen', 'disasterRate'],
  life: ['maxLifespan', 'fertility', 'mutationRate', 'selection', 'diseaseRate'],
  civ: ['techRate'],
};

function LawSliders({ L, c, godMode, keys }) {
  const [draft, setDraft] = useState(L.config);
  React.useEffect(() => setDraft(L.config), [JSON.stringify(L.config)]);
  const spec = L.configSpec || {};
  const list = (keys || Object.keys(spec)).filter((k) => spec[k]);
  const dirty = list.some((k) => draft[k] !== L.config[k]);
  return (
    <>
      <div className="sliders">
        {list.map((k) => {
          const sp = spec[k];
          return <label key={k} className="slider"><span>{sp.zh}</span><input type="range" min={sp.min} max={sp.max} step={(sp.max - sp.min) / 100} value={draft[k]} disabled={!godMode} onChange={(e) => setDraft({ ...draft, [k]: +e.target.value })} /><b className="num">{(+draft[k]).toFixed(sp.max >= 10 ? 1 : 3)}</b></label>;
        })}
      </div>
      <div className="btnrow end">
        <MButton className="ghost" disabled={!godMode || !dirty} onClick={() => setDraft(L.config)}>还原</MButton>
        <MButton className="primary" disabled={!godMode || !dirty} onClick={() => c('lifeConfig', draft)}><Scale size={14} />应用法则</MButton>
      </div>
    </>
  );
}

export default function Genesis({ s, mv, c, godMode, setView, setGodMode }) {
  const [tab, setTab] = useState('hub');
  const L = s.life; if (!L) return null;
  const social = L.social || {};
  const districts = L.civ?.districts || [];
  const src = mv.worlds.find((w) => w.worldId === mv.activeId) || mv.worlds[0];
  const hunger = s.hunger ?? s.world?.hunger ?? 0;

  return (
    <div className="view genesis">
      <div className="gen-hero">
        <div className="gen-hero-t">
          <div className="gen-mark"><Orbit size={20} strokeWidth={1.75} /></div>
          <div>
            <h1>创世中心</h1>
            <p>以观察者身份配置这个宇宙：法则、地球、生灵、天启与平行世界。改的是规则 R 或输入 h(t)，已经发生的历史不会被改写。全部操作仍须遵守 L1–L18。</p>
          </div>
        </div>
        <div className="gen-hero-a">
          {godMode ? <Badge tone="accent" dot>God Mode 已开启</Badge> : <MButton className="primary" onClick={() => setGodMode?.(true)}><Zap size={14} />开启 God Mode</MButton>}
          <span className="muted small num">纪元 {L.yearInt} 年 · {L.population} 人在世 · {L.civ?.era}</span>
        </div>
      </div>

      <Segmented id="genesis-tab" value={tab} onChange={setTab} options={[
        ['hub', '总览'], ['earth', '宇宙与地球'], ['laws', '世界法则'], ['beings', '生灵'], ['omen', '天启'], ['fork', '分叉世界'], ['social', '见闻与对话'],
      ]} />

      {tab === 'hub' && (
        <motion.div className="gen-hub" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <div className="stats4">
            <Stat icon={Hourglass} label="时间压缩" numeric={L.config.yearsPerDay} format={(v) => `${v} 年 / 日`} sub="世界日推进的纪元年" />
            <Stat icon={Users} label="在世人口" numeric={L.population} sub={`密度 ${Number(social.density || 0).toFixed(2)} 人 / 地点`} />
            <Stat icon={Building2} label="制度机构" numeric={social.institutionCount || 0} sub={`社会资本 ${Math.round((social.socialCapital || 0) * 100)}%`} />
            <Stat icon={MessageCircle} label="对话次数" numeric={social.talks || 0} sub={`传闻 ${social.rumors || 0} · 流通 ${Math.round((social.circulation || 0) * 100)}%`} />
          </div>
          <div className="gen-hub-grid">
            <Card title="宇宙层" icon={Globe2}>
              <dl className="kv">
                <dt>文明起点</dt><dd>{ERA[L.config.startEra] || L.config.startEra}（只在创世时决定）</dd>
                <dt>气候敏感度</dt><dd className="num">{L.config.climateSensitivity}</dd>
                <dt>资源再生率</dt><dd className="num">{L.config.resourceRegen}</dd>
                <dt>气温异常</dt><dd className="num">{L.env?.anomaly}</dd>
              </dl>
              <MButton className="ghost full" onClick={() => setTab('earth')}>配置地球参数</MButton>
            </Card>
            <Card title="世界法则" icon={Scale}>
              <p className="muted small mb">寿命、生育、突变、疫病与研究速度都在这里统一调整。改变法则不会改写已经发生的历史。</p>
              <MButton className="ghost full" onClick={() => setTab('laws')}>打开法则面板</MButton>
            </Card>
            <Card title="天启与演示" icon={Zap}>
              <p className="muted small mb">天启是一次人类输入。也可以把世界时间快进到饥饿阈值，方便演示外卖审批，而不必空等。</p>
              <div className="btnrow">
                <MButton className="ghost" disabled={!godMode} onClick={() => setTab('omen')}>进入天启</MButton>
                <MButton className="primary" disabled={!godMode} onClick={() => c('fastForwardHunger', 0.72)}><Utensils size={14} />快进到饥饿 72%</MButton>
              </div>
            </Card>
            <Card title="平行世界" icon={GitFork}>
              <p className="muted small mb">从当前世界的某一刻分叉，改性格、预算或法则，两条命运互不影响、不可合并。</p>
              <MButton className="ghost full" onClick={() => setTab('fork')}>打开分叉</MButton>
            </Card>
          </div>
          {districts.length > 0 && (
            <Card title="街区与机构" icon={Layers} actions={<span className="muted small">{districts.length} 个街区</span>}>
              <ul className="dist-list">
                {districts.map((d) => (
                  <li key={d.id}>
                    <b>{d.name}</b>
                    <span className="muted small">{d.places.length} 处地点 · {d.institutions} 个公共机构</span>
                    <em className="num">{d.population} 人在此</em>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </motion.div>
      )}

      {tab === 'earth' && (
        <div className="laws-grid">
          <Card title="宇宙与地球" icon={Globe2}>
            {!godMode && <div className="notice"><Info size={14} />修改地球参数属于干预，请先开启 God Mode。</div>}
            <p className="muted small mb">时间压缩、气候与资源再生共同决定这个星球的节律。不可再生资源一旦消耗就不会再增加（L12）。</p>
            <LawSliders L={L} c={c} godMode={godMode} keys={GROUPS.earth} />
          </Card>
          <Card title="当前环境" icon={Trees}>
            <Meter label="可再生资源" value={(L.env.renewable / L.env.renewableCap) * 100} />
            <Meter label="粮食水平" value={(L.env.food || 0) * 50} tone="soft" />
            <dl className="kv mt">
              <dt>气温异常</dt><dd className="num">{L.env.anomaly}</dd>
              <dt>不可再生资源</dt><dd className="num">{L.env.nonrenewable}</dd>
              <dt>熵</dt><dd className="num">{L.env.entropy}</dd>
              <dt>猎物 / 捕食者</dt><dd className="num">{Math.round(L.env.prey)} / {Math.round(L.env.predators)}</dd>
            </dl>
          </Card>
        </div>
      )}

      {tab === 'laws' && (
        <div className="laws-grid">
          <Card title="世界法则" icon={Scale}>
            {!godMode && <div className="notice"><Info size={14} />修改世界法则属于干预，请先开启 God Mode。</div>}
            <p className="hint">法则改变的是规则 R，而不是状态 S：已经发生的历史不会被改写，新法则从下一刻起生效。文明起点（{ERA[L.config.startEra] || L.config.startEra}）只在创世时决定。</p>
            <LawSliders L={L} c={c} godMode={godMode} />
          </Card>
          <Card title="定律约束" icon={BookOpen}>
            <p className="muted small mb">每一步都会自动校验 L1–L18，违反会记入错误事件。创世中心不能绕过这些定律——例如死者不能复活。</p>
            <ul className="law-mini">
              <li><em>L8</em>必死律：不能复活</li>
              <li><em>L9</em>遗传守恒：子代基因来自父母</li>
              <li><em>L12</em>资源有限：不可再生资源只减不增</li>
              <li><em>L17</em>代谢律：饥饿只随时间上升</li>
              <li><em>L18</em>人机边界：支出必须审批，接管时智能体停手</li>
            </ul>
          </Card>
        </div>
      )}

      {tab === 'beings' && (
        <div className="laws-grid">
          <Card title="生灵法则" icon={Sprout}>
            {!godMode && <div className="notice"><Info size={14} />请先开启 God Mode 再调整生育、突变与寿命。</div>}
            <LawSliders L={L} c={c} godMode={godMode} keys={GROUPS.life.concat(GROUPS.civ)} />
          </Card>
          <Card title="种群与文明密度" icon={Users}>
            <div className="grid2">
              <Meter label="识字率（平均教育）" value={(social.literacy || 0) * 100} />
              <Meter label="城镇化" value={Math.min(100, (social.urban || 0) * 50)} tone="soft" />
              <Meter label="信息流通" value={(social.circulation || 0) * 100} tone="soft" />
              <Meter label="社会资本" value={(social.socialCapital || 0) * 100} />
            </div>
            <dl className="kv mt">
              <dt>始祖人数</dt><dd className="num">{L.config.founders}（只在创世时决定）</dd>
              <dt>在世 / 出生 / 死亡</dt><dd className="num">{L.population} / {L.counters.births} / {L.counters.deaths}</dd>
              <dt>公共机构</dt><dd className="num">{social.institutionCount || 0}（医院、学校、文化中心）</dd>
            </dl>
          </Card>
        </div>
      )}

      {tab === 'omen' && (
        <div className="laws-grid">
          <Card title="天启" icon={Zap}>
            <p className="muted small mb">天启是人类输入 h(t)，同样必须遵守全部定律。开启 God Mode 后才可发动。</p>
            <div className="god-grid">
              {GOD.map(([k, label, I]) => <MButton key={k} className="ghost god-btn" disabled={!godMode || L.ended} onClick={() => c('godEvent', k)}><I size={16} /><span>{label}</span></MButton>)}
              <div className="god-btn forbidden" title="L8 必死律禁止"><Ban size={16} /><span>复活死者</span><em>被 L8 必死律禁止</em></div>
            </div>
          </Card>
          <Card title="演示场景" icon={Utensils}>
            <p className="muted small mb">快进只推进世界时钟，让饥饿随代谢自然上升（L17），不会凭空改写饥饿，也不会代替智能体去下单。到达阈值后，把观察切到智能体桌面，TA 会自己打开外卖并申请审批。</p>
            <div className="ff-hunger">
              <span>当前饥饿</span><b className="num">{Math.round(hunger * 100)}%</b>
            </div>
            <div className="btnrow">
              <MButton className="primary" disabled={!godMode} onClick={() => c('fastForwardHunger', 0.72)}><Utensils size={14} />快进到饥饿 72%</MButton>
              <MButton className="ghost" onClick={() => setView?.('desktop')}>去智能体桌面</MButton>
            </div>
          </Card>
        </div>
      )}

      {tab === 'fork' && (
        <div className="gen-fork">
          <ForkPanel key={src?.worldId} mv={mv} src={src} c={c} godMode={godMode} />
          <MButton className="ghost" onClick={() => setView?.('multiverse')}>打开平行世界分支图</MButton>
        </div>
      )}

      {tab === 'social' && (
        <div className="gen-social">
          <TalkPanel s={s} c={c} />
          <Card title="正在流传的见闻" icon={Activity} pad={false} actions={<span className="muted small">事实 {social.facts || 0} · 传闻 {social.rumorCount || 0}</span>}>
            {social.intel?.length ? (
              <ul className="intel-list">
                {social.intel.map((i) => (
                  <li key={i.id} className={i.kind === 'rumor' ? 'rumor' : 'fact'}>
                    <Badge tone={i.kind === 'rumor' ? 'warn' : 'accent'}>{i.kind === 'rumor' ? '传闻' : '事实'}</Badge>
                    <p>{i.text}</p>
                    <span className="muted small num">完整度 {Math.round((i.fidelity || 0) * 100)}% · {i.holders} 人知晓 · 纪元 {Math.floor(i.year)} 年</span>
                  </li>
                ))}
              </ul>
            ) : <div className="chart-empty">居民之间还没有传播开的见闻。推进世界时间后，他们会在同一地点交谈。</div>}
          </Card>
        </div>
      )}
    </div>
  );
}
