import React from 'react';
import { Box, IdCard, Radar as RadarIcon, Link2, Mail, Phone, CreditCard } from 'lucide-react';
import { Card, Badge } from '../components/ui.jsx';
import { Radar } from '../components/charts.jsx';
import Avatar3D from '../components/Avatar3D.jsx';
import ProfileCard from '../components/ProfileCard.jsx';
const G = { openness: '开放', conscientiousness: '尽责', extraversion: '外向', agreeableness: '宜人', neuroticism: '敏感', risk_tolerance: '冒险', frugality: '节俭', curiosity: '好奇' };
export default function Identity({ s }) {
  const vals = Object.fromEntries(Object.entries(s.dna.genome).map(([k, v]) => [k, { v, label: G[k] || k }]));
  const ad = s.adapters;
  return (
    <div className="view identity">
      <Card title="形象" icon={Box} className="id-stage" pad={false} actions={<span className="muted small">拖动旋转 · 程序化生成</span>}>
        <Avatar3D appearance={s.dna.appearance} seed={s.dna.seed} height={520} />
        <div className="stage-caption"><span>{s.persona.name}</span><span className="muted">{{ techwear: '机能风', hoodie: '连帽卫衣', 'lab-coat': '实验白袍', 'kimono-modern': '新式和服', 'flight-jacket': '飞行夹克', 'minimal-suit': '极简西装' }[s.dna.appearance.outfit] || s.dna.appearance.outfit} · 发型 {['短发', '长发', '刺猬头', '丸子头', '马尾'][s.dna.appearance.hair_style] ?? s.dna.appearance.hair_style}</span></div>
      </Card>
      <div className="id-side">
        <Card title="角色档案" icon={IdCard}><ProfileCard card={s.persona.profileCard} /></Card>
        <Card title="性格基因" icon={RadarIcon}><Radar values={vals} size={250} /></Card>
        <Card title="身份通道" icon={Link2} actions={<span className="muted small">法律上归操作者</span>}>
          <ul className="channels">
            <li><Mail size={14} /><span>{ad.email.address}</span><Badge>{ad.email.kind}</Badge></li>
            <li><Phone size={14} /><span>{ad.phone.number}</span><Badge>{ad.phone.kind}</Badge></li>
            <li><CreditCard size={14} /><span>{ad.payment.card?.brand} ···· {ad.payment.card?.last4}</span><Badge>{ad.payment.kind}</Badge></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
