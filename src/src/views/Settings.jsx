import React from 'react';
import { Cpu, Plug, Server, Scale, FileJson } from 'lucide-react';
import { Card, Badge } from '../components/ui.jsx';
export default function Settings({ s, mv }) {
  const ad = s.adapters;
  const row = (name, kind, desc) => <li><div><b>{name}</b><span>{desc}</span></div><Badge tone={kind === 'mock' ? 'default' : 'accent'}>{kind}</Badge></li>;
  return (
    <div className="view cols2">
      <div className="notice" style={{ gridColumn: '1 / -1' }}><Scale size={14} /><span>想看 TA 自己点外卖？去侧栏「智能体桌面」。想暂停或接管？先开右上角 God Mode。花钱审批在右下角，只读也能批。</span></div>
      <div className="col">
        <Card title="大脑" icon={Cpu}>
          <dl className="kv"><dt>模式</dt><dd>{s.llm.enabled ? 'LLM（OpenAI 兼容）' : '规则策略（未配置 LLM）'}</dd><dt>模型</dt><dd className="mono">{s.llm.model || '—'}</dd><dt>接口</dt><dd className="mono">{s.llm.baseUrl}</dd></dl>
          <p className="hint">在项目根目录 .env 中设置 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL 后重启。</p>
        </Card>
        <Card title="适配器" icon={Plug}>
          <ul className="settings-list">
            {row('支付', ad.payment.kind, 'mock · stripe（仅测试密钥）')}
            {row('邮箱', ad.email.kind, 'mock · agentmail')}
            {row('电话', ad.phone.kind, 'mock · twilio')}
            {row('世界', s.worldKind, 'sim · qemu（实验性）')}
          </ul>
        </Card>
        <Card title="合规" icon={Scale}>
          <ul className="bullets">
            <li>所有账户、支付工具与收益在法律上归人类操作者所有。</li>
            <li>角色档案卡为虚构内容，不可用于任何现实身份核验。</li>
            <li>默认每笔支出需人工批准；加密支付在中国大陆不可用。</li>
          </ul>
        </Card>
      </div>
      <div className="col">
        <Card title="DNA" icon={FileJson} className="grow" pad={false}><pre className="code">{JSON.stringify(s.dna, null, 2)}</pre></Card>
        <Card title="世界与定律" icon={Server}>
          <dl className="kv"><dt>当前世界</dt><dd>{s.meta.name}（{s.worldKind}）</dd><dt>节奏</dt><dd className="num">{s.tickMs} ms / 步</dd><dt>平行世界</dt><dd className="num">{mv.worlds.length} / {mv.max}</dd><dt>定律违反</dt><dd className="num">{s.violations.length}</dd></dl>
          <p className="hint">世界状态转移遵循 S(t+1) = F(S(t), 智能体动作, 人类输入; 规则, 种子)，每步校验货币守恒、货币边界、因果、时间之箭、熵与需求等定律（见设计文档第 10 节）。</p>
        </Card>
      </div>
    </div>
  );
}
