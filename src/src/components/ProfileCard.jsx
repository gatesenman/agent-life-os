import React from 'react';
import { ShieldAlert } from 'lucide-react';
// 虚构的世界内角色档案卡：刻意不模仿任何真实证件版式
export default function ProfileCard({ card }) {
  if (!card) return null;
  const initials = card.name.slice(0, 1);
  return (
    <div className="pcard">
      <div className="pcard-wm">FICTIONAL</div>
      <div className="pcard-top">
        <div className="pcard-avatar">{initials}</div>
        <div>
          <div className="pcard-name">{card.name}</div>
          <div className="pcard-meta">{card.age} 岁 · {card.homeWorld}（虚构）</div>
        </div>
        <span className="pcard-tag">虚构档案</span>
      </div>
      <dl className="kv">
        <dt>档案编号</dt><dd className="mono">{card.id}</dd>
        <dt>DNA 指纹</dt><dd className="mono">{card.dnaFingerprint}</dd>
        <dt>法律责任人</dt><dd>{card.legalOwner}</dd>
      </dl>
      <div className="chips">{card.traits.map((t) => <span key={t} className="chip">{t}</span>)}</div>
      <div className="pcard-notice"><ShieldAlert size={13} strokeWidth={1.75} /><span>{card.watermark}</span></div>
      <p className="pcard-disc">{card.disclaimer}</p>
    </div>
  );
}
