import React, { useState } from 'react';
import { MessagesSquare, Send, UserRound, Info } from 'lucide-react';
import { Card, Badge, MButton } from './ui.jsx';

// 与虚拟人对话：档案式谈话记录，而不是即时通讯气泡
export default function TalkPanel({ s, c, personId, onPerson, compact }) {
  const social = s.life?.social;
  const dir = social?.directory || [];
  const [localId, setLocalId] = useState(personId || '');
  const id = personId || localId;
  const current = dir.find((p) => p.id === id) || dir.find((p) => p.focus) || dir[0];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const log = (social?.recent || []).filter((t) => {
    if (!current) return t.source === 'human';
    if (t.source === 'human') return t.b === current.id;
    return t.a === current.id || t.b === current.id;
  }).slice(0, compact ? 8 : 16);

  const send = async () => {
    const msg = text.trim(); if (!msg || !current || busy) return;
    setBusy(true); setErr(null);
    const r = await c('talk', { personId: current.id, text: msg });
    setBusy(false);
    if (r?.error) setErr(r.error); else setText('');
  };

  return (
    <Card title="与居民对话" icon={MessagesSquare} className={compact ? '' : 'talk-card'} actions={current && <Badge tone={current.focus ? 'accent' : 'default'}>{current.focus ? '主角' : `第 ${current.gen} 代`}</Badge>}>
      {!dir.length ? <div className="chart-empty">这个世界还没有可以交谈的在世居民。</div> : (
        <>
          <div className="talk-pick">
            <UserRound size={14} />
            <select value={current?.id || ''} onChange={(e) => { setLocalId(e.target.value); onPerson?.(e.target.value); }} aria-label="选择对话对象">
              {dir.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.age} 岁 · {p.stage}{p.focus ? '（主角）' : ''}</option>)}
            </select>
            {current && <span className="muted small">{current.belief}{current.home ? ` · ${current.home}` : ''}</span>}
          </div>
          <p className="hint talk-hint"><Info size={12} />对话是人类输入，会写入对方的见闻；若对方是主角，还会进入记忆流，并可能出现在次日计划里。已故之人不可交谈。</p>
          <ol className="talk-log" aria-live="polite">
            {log.length === 0 && <li className="muted small">还没有与{current ? ` ${current.name}` : '这位居民'}的谈话记录。说一句问候即可开始。</li>}
            {log.slice().reverse().map((t) => (
              <li key={t.id} className={t.source === 'human' ? 'from-human' : 'from-agent'}>
                <header><b>{t.source === 'human' ? '观察者' : t.aName}</b><span className="num muted">纪元 {Math.floor(t.year)} 年{t.place ? ` · ${t.place}` : ''}{t.kind === 'rumor' ? ' · 传闻' : ''}</span></header>
                <p>{t.source === 'human' ? t.text : t.text}</p>
                {t.reply && <p className="talk-reply"><b>{t.bName}</b>{t.reply}</p>}
              </li>
            ))}
          </ol>
          {err && <div className="notice">{err}</div>}
          <div className="talk-compose">
            <input value={text} disabled={busy || !current} maxLength={400} placeholder={current ? `对 ${current.name} 说…` : '选择一位居民'}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <MButton className="primary" disabled={busy || !text.trim() || !current} onClick={send}><Send size={14} />{busy ? '传达中…' : '传达'}</MButton>
          </div>
        </>
      )}
    </Card>
  );
}
