import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MonitorSmartphone, Laptop, Server, Plus, PlugZap, Unplug, Play, Pause, StepForward, Hand, HandMetal, Target, ListChecks, Brain, ScrollText, Film, ReceiptText,
  CheckCircle2, XCircle, Circle, Loader2, Utensils, Zap, Wallet, ShieldCheck, Trash2, X, SkipBack, SkipForward, Radio, Eye, Cpu, Info, Lock, Activity as ActivityIcon,
} from 'lucide-react';
import { Card, Badge, MButton, money } from '../components/ui.jsx';
import { spring } from '../components/motion.jsx';
import SandboxScreen from '../components/SandboxScreen.jsx';

const api = typeof window !== 'undefined' ? window.alos : null;
const STATE = { connected: ['live', '已连接'], connecting: ['warn', '连接中'], error: ['neg', '连接失败'], disconnected: ['warn', '已断开'], idle: ['default', '空闲'], unbound: ['default', '未绑定'] };
const ORDER = { awaiting: ['warn', '待批准'], paid: ['accent', '配送中'], delivered: ['live', '已送达'], eaten: ['default', '已用餐'], cancelled: ['default', '已取消'], denied: ['neg', '被拒绝'] };
const ACT = { move: '移动', click: '点击', double_click: '双击', type: '键入', key: '按键', scroll: '滚动', wait: '等待', rest: '休息', request_payment: '申请支付', done: '完成' };
const actText = (a) => {
  if (!a) return '';
  if (a.type === 'click' || a.type === 'double_click' || a.type === 'move') return `${ACT[a.type]} (${a.x}, ${a.y})`;
  if (a.type === 'type') return `${ACT.type}「${a.text?.length > 26 ? a.text.slice(0, 26) + '…' : a.text}」`;
  if (a.type === 'key') return `${ACT.key} ${a.keys}`;
  if (a.type === 'scroll') return `${ACT.scroll} ${a.dy}`;
  if (a.type === 'wait') return `${ACT.wait}${a.reason ? '：' + a.reason : ''}`;
  if (a.type === 'request_payment') return `${ACT.request_payment} $${a.amount}`;
  return ACT[a.type] || a.type;
};

function Bar({ icon: Icon, label, value, max = 1, tone, text }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="dk-bar">
      <div className="dk-bar-l"><Icon size={13} strokeWidth={1.75} /><span>{label}</span><b className="num">{text}</b></div>
      <div className="meter-track"><motion.div className={`meter-fill ${tone}`} initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} /></div>
    </div>
  );
}

function AddTarget({ open, onClose, onAdded }) {
  const [f, setF] = useState({ name: '', host: '127.0.0.1', port: '5900', password: '' });
  const [test, setTest] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setTest(null); };
  const doTest = async () => { setBusy(true); setErr(null); const r = await api.desktop('test', f); setTest(r); setBusy(false); };
  const save = async () => { setBusy(true); const r = await api.desktop('addTarget', f); setBusy(false); if (!r.ok) setErr(r.error); else { onAdded(r); onClose(); setF({ name: '', host: '127.0.0.1', port: '5900', password: '' }); setTest(null); } };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none', transitionEnd: { display: 'none' } }} onClick={onClose}>
          <motion.div className="modal dk-modal" role="dialog" aria-modal="true" aria-labelledby="dk-add-t" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={spring}>
            <button className="modal-x" onClick={onClose} aria-label="关闭"><X size={16} /></button>
            <h2 id="dk-add-t"><Server size={18} strokeWidth={1.75} />添加本地虚拟电脑（VNC）</h2>
            <p className="muted small">支持 QEMU（-vnc）、VirtualBox（VRDE/VNC 扩展）、UTM、x11vnc 以及任意 RFB 3.3–3.8 服务器。认证方式：无密码或标准 VNC 密码。暂不支持 TLS/VeNCrypt，远程主机请用 SSH 隧道转发到本机端口。</p>
            <div className="dk-form">
              <label><span>名称</span><input value={f.name} onChange={set('name')} placeholder="例如：UTM · Ubuntu 外卖测试机" /></label>
              <div className="dk-form-row">
                <label className="grow"><span>主机</span><input value={f.host} onChange={set('host')} placeholder="127.0.0.1" /></label>
                <label className="port"><span>端口</span><input value={f.port} onChange={set('port')} inputMode="numeric" /></label>
              </div>
              <label><span>VNC 密码（可选）</span><input type="password" value={f.password} onChange={set('password')} placeholder="保存在系统钥匙串，不写入明文" /></label>
            </div>
            <AnimatePresence>
              {test && (
                <motion.div className={`dk-test ${test.ok ? 'ok' : 'bad'}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  {test.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <div>{test.ok ? <><b>连接成功：{test.name}</b><small>{test.width}×{test.height} · RFB {test.version} · {test.security} · 延迟 {test.latencyMs} ms</small></> : <><b>连接失败</b><small>{test.error}</small></>}</div>
                  {test.ok && test.preview && <img src={test.preview} alt="首帧预览" />}
                </motion.div>
              )}
            </AnimatePresence>
            {err && <div className="dk-test bad"><XCircle size={16} /><div><b>{err}</b></div></div>}
            <div className="btnrow end">
              <MButton className="ghost" onClick={doTest} disabled={busy || !f.host}>{busy ? <Loader2 size={14} className="spin" /> : <PlugZap size={14} />}测试连接</MButton>
              <MButton className="primary" onClick={save} disabled={busy || !f.host}><Plus size={14} />保存目标</MButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Replay({ id, onClose }) {
  const [rec, setRec] = useState(null); const [i, setI] = useState(0); const [playing, setPlaying] = useState(true);
  useEffect(() => { api.desktop('recording', { id }).then((r) => { setRec(r.recording); setI(0); }); }, [id]);
  const steps = rec?.steps || []; const st = steps[i];
  useEffect(() => { if (!playing || !steps.length) return; const t = setTimeout(() => { if (i < steps.length - 1) setI(i + 1); else setPlaying(false); }, 900); return () => clearTimeout(t); }, [playing, i, steps.length]);
  if (!rec) return <div className="dk-replay-empty"><Loader2 size={16} className="spin" />正在载入录像…</div>;
  const screen = st?.frame?.nodes ? { width: 1280, height: 800, nodes: st.frame.nodes, cursor: st.frame.cursor } : { width: 1280, height: 800, cursor: st?.frame?.cursor };
  return (
    <div className="dk-replay">
      <div className="dk-replay-h">
        <Film size={15} strokeWidth={1.75} /><b>录像回放：{rec.goal}</b><span className="muted small">{rec.started} → {rec.ended || '进行中'} · {steps.length} 步</span>
        <MButton className="ghost sm" onClick={onClose}><X size={13} />回到直播</MButton>
      </div>
      <SandboxScreen screen={screen} image={st?.frame?.image} action={st} live={false} />
      <div className="dk-scrub">
        <button className="tb-btn" onClick={() => setI(Math.max(0, i - 1))} aria-label="上一步"><SkipBack size={14} /></button>
        <button className="tb-btn" onClick={() => { if (i >= steps.length - 1) setI(0); setPlaying(!playing); }} aria-label={playing ? '暂停回放' : '播放回放'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        <button className="tb-btn" onClick={() => setI(Math.min(steps.length - 1, i + 1))} aria-label="下一步"><SkipForward size={14} /></button>
        <input type="range" min={0} max={Math.max(0, steps.length - 1)} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} aria-label="回放进度" />
        <span className="num muted small">{i + 1} / {steps.length}</span>
      </div>
      {st && <div className="dk-replay-cap"><span className="num muted">{st.clock}</span><b>{actText(st.action)}</b><span>{st.thought}</span></div>}
    </div>
  );
}

export default function Desktop({ s, c, godMode, setGodMode, replayId }) {
  const d = s.desktop || { active: false, status: { state: 'unbound' }, thoughts: [], actions: [], recordings: [], orders: [] };
  const [targets, setTargets] = useState({ targets: [], binding: null });
  const [adding, setAdding] = useState(false); const [testing, setTesting] = useState(null); const [testRes, setTestRes] = useState({});
  const rid = (x) => { const id = x?.split('#')[0]; return id && id !== 'none' ? id : null; };
  const [frame, setFrame] = useState(null); const [replay, setReplay] = useState(rid(replayId)); const [note, setNote] = useState(null);
  const refresh = () => api.desktop('targets').then(setTargets);
  useEffect(() => { refresh(); }, [s.meta.worldId, d.target?.id]);
  useEffect(() => { if (replayId) setReplay(rid(replayId)); }, [replayId]);
  useEffect(() => {
    if (d.target?.kind !== 'vnc') { setFrame(null); return; }
    api.desktop('frame').then((r) => r.image && setFrame(r.image));
    return api.onFrame((f) => f.worldId === s.meta.worldId && setFrame(f.image));
  }, [d.target?.kind, d.target?.id, s.meta.worldId]);
  const bound = d.target?.id || null;
  const st = STATE[d.status?.state] || STATE.idle;
  const pol = s.policy; const bal = s.adapters.payment.balance; const energy = s.world?.energy ?? 0; const hunger = s.hunger ?? 0;

  const bind = async (id) => { const r = await api.desktop('bind', { id }); if (!r.ok) setNote(r.error || r.status?.error || '绑定失败'); else setNote(null); refresh(); };
  const unbind = async () => { await api.desktop('unbind'); refresh(); };
  const test = async (id) => { setTesting(id); const r = await api.desktop('test', { id }); setTestRes({ ...testRes, [id]: r }); setTesting(null); };
  const remove = async (id) => { await api.desktop('removeTarget', { id }); refresh(); };
  const input = async (a) => { const r = await api.desktop('input', a); if (r && !r.ok && r.error) setNote(r.error); };
  const plan = d.goal?.plan || [];
  const doneN = plan.filter((p) => p.status === 'done').length;
  const lastActs = useMemo(() => d.actions.slice().reverse().slice(0, 18), [d.actions]);

  return (
    <div className="view desktop">
      <motion.div className="dk-targets" layout>
        <div className="dk-targets-l">
          <span className="dk-label"><Laptop size={14} strokeWidth={1.75} />绑定的电脑</span>
          {targets.targets.map((t) => {
            const on = bound === t.id; const tr = testRes[t.id];
            return (
              <motion.div key={t.id} className={`dk-target ${on ? 'on' : ''}`} layout whileHover={{ y: -1 }} transition={spring}>
                {on && <motion.span layoutId="dk-target-pill" className="dk-target-pill" transition={spring} />}
                <button className="dk-target-main" onClick={() => !on && bind(t.id)} title={on ? '当前绑定' : '绑定给当前智能体'}>
                  {t.kind === 'sandbox' ? <MonitorSmartphone size={15} strokeWidth={1.75} /> : <Server size={15} strokeWidth={1.75} />}
                  <span className="dk-tn">{t.name}</span>
                  <span className="dk-ts muted small">{t.kind === 'sandbox' ? '离线 · 零配置' : `${t.host}:${t.port}${t.hasPassword ? ' · 已设密码' : ''}`}</span>
                  {tr && (tr.ok ? <CheckCircle2 size={13} className="pos" /> : <XCircle size={13} className="neg" />)}
                </button>
                <button className="dk-ti" onClick={() => test(t.id)} title="测试连接" aria-label="测试连接">{testing === t.id ? <Loader2 size={13} className="spin" /> : <PlugZap size={13} />}</button>
                {!t.builtin && <button className="dk-ti" onClick={() => remove(t.id)} title="删除目标" aria-label="删除目标"><Trash2 size={13} /></button>}
              </motion.div>
            );
          })}
          <MButton className="ghost sm" onClick={() => setAdding(true)}><Plus size={13} />添加 VNC 电脑</MButton>
        </div>
        <div className="dk-targets-r">
          <Badge tone={st[0]} dot>{d.active ? `${st[1]} · ${d.target?.name}` : '未绑定：智能体在经典任务板世界里生活'}</Badge>
          {d.active && <MButton className="ghost sm" onClick={unbind}><Unplug size={13} />解除绑定</MButton>}
        </div>
      </motion.div>
      {(note || d.status?.error) && <div className="dk-note"><Info size={14} />{note || `连接错误：${d.status.error}`}</div>}
      {d.active && !d.goal && s.running && !s.paused && <div className="dk-coach"><Radio size={13} />TA 正在根据饥饿、能量与余额选择目标。饥饿到 60% 会去点外卖 —— 也可以开启 God Mode 后点「单步」加速。</div>}
      {d.active && d.goal?.kind === 'eat' && (d.orders || []).some((o) => o.status === 'awaiting') && <div className="dk-coach warn"><ShieldCheck size={13} />订单已提交，右下角审批卡片出现后点「批准」，外卖才会配送；批准前不会扣款。</div>}

      <div className="dk-grid">
        <Card className="dk-screen-card" pad={false} title={replay ? '录像回放' : `${s.persona.name} 的电脑`} icon={replay ? Film : Eye}
          actions={!replay && (
            <div className="dk-ctrl">
              {d.active && !s.paused && !s.takeover && <span className="dk-live"><Radio size={12} />直播</span>}
              {d.llm ? <Badge tone="accent"><Cpu size={11} />视觉模型 {d.llm}</Badge> : <Badge><Cpu size={11} />{d.target?.kind === 'vnc' ? '未配置视觉模型' : '规则回退（屏幕解析）'}</Badge>}
              <div className="tb-group">
                {s.paused ? <button className="tb-btn" disabled={!godMode} onClick={() => c('resume')} title="继续" aria-label="继续"><Play size={14} /></button>
                  : <button className="tb-btn" disabled={!godMode} onClick={() => c('pause')} title="暂停" aria-label="暂停"><Pause size={14} /></button>}
                <button className="tb-btn" disabled={!godMode} onClick={() => c('step')} title="单步" aria-label="单步"><StepForward size={14} /></button>
              </div>
              <MButton className={s.takeover ? 'primary sm' : 'ghost sm'} disabled={!godMode} onClick={() => c('takeover', !s.takeover)} title={godMode ? '' : '开启 God Mode 后才能接管'}>
                {s.takeover ? <HandMetal size={13} /> : <Hand size={13} />}{s.takeover ? '交还控制' : '接管'}
              </MButton>
              {!godMode && <MButton className="ghost sm" onClick={() => setGodMode?.(true)}><Lock size={13} />开启 God Mode</MButton>}
            </div>
          )}>
          {replay ? <Replay id={replay} onClose={() => setReplay(null)} /> : d.active ? (
            <div className="dk-screen">
              <SandboxScreen screen={d.screen} image={d.target?.kind === 'vnc' ? frame : null} action={d.last} interactive={s.takeover && godMode} onInput={input} />
              <AnimatePresence>
                {s.takeover && <motion.div className="dk-takeover" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Hand size={13} />已接管：点击、滚动与键入直接发送到这台电脑，智能体暂停，操作写入审计日志</motion.div>}
              </AnimatePresence>
              <div className="dk-caption">
                <span className="num muted">{d.last?.clock}</span>
                {d.last && <b>{d.last.human ? '[你] ' : ''}{actText(d.last.action)}</b>}
                {d.last?.verify && <span className={d.last.verify.ok ? 'pos' : 'neg'}>{d.last.verify.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{d.last.verify.text}</span>}
              </div>
            </div>
          ) : (
            <div className="dk-empty">
              <MonitorSmartphone size={34} strokeWidth={1.3} />
              <b>给 {s.persona.name} 一台电脑，看 TA 自己生活</b>
              <span className="muted">推荐「内置沙盒桌面」：零配置、离线可用。饿了点外卖、钱少接零工、累了休息 —— 付款前一定问你批准。</span>
              <MButton className="primary" onClick={() => bind('sandbox')}><PlugZap size={14} />绑定内置沙盒桌面（推荐）</MButton>
              <span className="muted small">也可以添加本机 QEMU / VirtualBox / UTM / x11vnc 的 VNC 地址。</span>
            </div>
          )}
        </Card>

        <div className="dk-side">
          <Card title="当前目标" icon={Target}>
            {d.goal ? (
              <>
                <div className="dk-goal"><b>{d.goal.title}</b><span className="muted small">因为{d.goal.why}</span></div>
                <div className="dk-progress"><motion.i initial={false} animate={{ width: `${plan.length ? (doneN / plan.length) * 100 : 0}%` }} transition={spring} /></div>
                <ol className="dk-plan">
                  {plan.map((p) => (
                    <motion.li key={p.id} className={p.status} layout transition={spring}>
                      {p.status === 'done' ? <CheckCircle2 size={14} /> : p.status === 'active' ? <Loader2 size={14} className="spin" /> : <Circle size={14} />}<span>{p.title}</span>
                    </motion.li>
                  ))}
                </ol>
              </>
            ) : <div className="muted small">{d.active ? '正在根据生命需求选择下一个目标…' : '绑定电脑后，目标会由饥饿、余额、精力等生命需求自动产生。'}</div>}
          </Card>
          <Card title="身体与钱包" icon={Utensils}>
            <Bar icon={Utensils} label="饥饿" value={hunger} tone={hunger >= 0.6 ? 'warn' : 'accent'} text={`${Math.round(hunger * 100)}%`} />
            <Bar icon={Zap} label="能量" value={energy} max={100} tone={energy < 22 ? 'warn' : 'pos'} text={Math.round(energy)} />
            <Bar icon={ShieldCheck} label="今日预算" value={pol.spentToday} max={pol.dailyCapUsd} tone="accent" text={`${money(pol.spentToday)} / ${money(pol.dailyCapUsd)}`} />
            <div className="dk-bal"><Wallet size={13} strokeWidth={1.75} /><span>余额</span><b className="num">{money(bal)}</b></div>
          </Card>
          {d.reliability && <Card title="可靠性" icon={ActivityIcon} actions={<span className="muted small">行动觉察 · 卡死检测 · 步数预算</span>}>
            <div className="rel-grid">
              <div><span>目标完成率</span><b className="num">{d.reliability.goalRate == null ? '—' : d.reliability.goalRate + '%'}</b><small className="num">{d.reliability.done} 成 / {d.reliability.failed} 弃</small></div>
              <div><span>动作校验通过</span><b className="num">{d.reliability.verifyRate == null ? '—' : d.reliability.verifyRate + '%'}</b><small className="num">{d.reliability.verifyOk} / {d.reliability.verified}</small></div>
              <div><span>卡死自救</span><b className="num">{d.reliability.stuck}</b><small>连续 3 次无效即换目标</small></div>
              <div><span>预算熔断</span><b className="num">{d.reliability.budget}</b><small>单目标 120 步上限</small></div>
            </div>
          </Card>}
          <Card title="思维流" icon={Brain} className="dk-thoughts" pad={false}>
            <ul>
              <AnimatePresence initial={false}>
                {d.thoughts.slice().reverse().slice(0, 9).map((t) => (
                  <motion.li key={t.id} className={t.kind} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring}>{t.text}</motion.li>
                ))}
              </AnimatePresence>
              {!d.thoughts.length && <li className="muted">暂无</li>}
            </ul>
          </Card>
        </div>
      </div>

      <div className="dk-bottom">
        <Card title="动作日志" icon={ScrollText} className="grow" pad={false}>
          <table className="table dk-log">
            <thead><tr><th>时间</th><th>步骤</th><th>动作</th><th>结果</th><th className="r">校验</th></tr></thead>
            <tbody>
              {lastActs.map((a) => (
                <tr key={a.id}>
                  <td className="num muted">{a.clock || '—'}</td><td className="muted">{a.human ? '人工' : a.step || '—'}</td><td><code>{actText(a.action)}</code></td><td>{a.result}</td>
                  <td className="r">{a.verify ? (a.verify.ok ? <CheckCircle2 size={14} className="pos" aria-label="校验通过" /> : <XCircle size={14} className="neg" aria-label="校验失败" />) : <span className="muted">—</span>}</td>
                </tr>
              ))}
              {!lastActs.length && <tr><td colSpan={5} className="muted">还没有动作</td></tr>}
            </tbody>
          </table>
        </Card>
        <div className="dk-bottom-r">
          <Card title="外卖订单" icon={ReceiptText} pad={false}>
            <ul className="dk-orders">
              {d.orders.slice().reverse().map((o) => (
                <li key={o.id}><div><b>{o.shop}</b><small className="muted">{o.id} · {o.items.map((x) => x.name).join('、')}</small></div><span className="num">{money(o.total)}</span><Badge tone={ORDER[o.status]?.[0]}>{ORDER[o.status]?.[1] || o.status}</Badge></li>
              ))}
              {!d.orders.length && <li className="muted small">还没有订单。每笔订单都要经过预算策略和你的批准才会扣款。</li>}
            </ul>
          </Card>
          <Card title="录像" icon={Film} pad={false}>
            <ul className="dk-recs">
              {d.recordings.slice(0, 7).map((r) => (
                <li key={r.id}><button onClick={() => setReplay(r.id)} className={replay === r.id ? 'on' : ''}>
                  {r.status === 'done' ? <CheckCircle2 size={13} className="pos" /> : <XCircle size={13} className="neg" />}<span>{r.goal}</span><small className="muted num">{r.started?.replace(/^第\d+天 /, '')} · {r.steps} 步</small><Play size={12} />
                </button></li>
              ))}
              {!d.recordings.length && <li className="muted small">每完成一个目标会自动保存一段录像。</li>}
            </ul>
          </Card>
        </div>
      </div>
      <AddTarget open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    </div>
  );
}
