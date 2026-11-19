import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Eye, ShieldCheck, GitBranch, ArrowRight, ArrowLeft, X, MonitorSmartphone, Play } from 'lucide-react';
import { MButton } from './ui.jsx';
import { spring } from './motion.jsx';

const STEPS = [
  {
    icon: Sparkles, title: '你在观察一位虚拟人生活',
    body: 'TA 由 DNA 种子生成：有姓名、性格、饥饿与能量。默认绑定一台「内置沙盒桌面」，会自己找工作、点外卖、写日记。你是世界之外的人类守护者。',
    points: ['核心体验在「智能体桌面」：看 TA 第一人称操作电脑', '账户与收益在法律上归你；档案卡是虚构角色卡'] },
  {
    icon: MonitorSmartphone, title: '先看 TA 怎么用电脑',
    body: '饿了会打开外卖网站点餐，钱少了去接零工，累了休息。你能看到光标轨迹、点击和键入。付款前一定弹出审批，批准后才扣款。',
    points: ['零配置：默认就是内置沙盒，不需要装虚拟机', '每个目标会自动录像，可回放'] },
  {
    icon: ShieldCheck, title: '花钱必须经过你批准',
    body: '右下角会出现审批卡片，标明哪个平行世界、是否来自电脑。批准后才会扣款；拒绝后 TA 会把教训写进长期记忆。',
    points: ['审批是守护职责，只读模式也能做', '每日预算与单笔上限可在分叉世界时调整'] },
  {
    icon: Eye, title: '默认只读；God Mode 才能干预',
    body: '只读时你不会误触暂停或接管。点右上角「只读观察」开启 God Mode 后，才能暂停、单步、接管电脑、下达指令或分叉平行世界。',
    points: ['每一次干预都会写入时间线与审计日志', '再次点击即可退回只读'] },
  {
    icon: GitBranch, title: '准备好了？去看第一人称',
    body: '侧栏还可进入镜像世界（真实街区）、生命与家族、平行世界对比。现在先打开智能体桌面，等 TA 饿了点外卖 —— 那是最完整的一圈核心循环。',
    points: ['标题栏世界切换器可随时切换平行世界', '随时点问号重新查看本引导'] },
];

export default function Onboarding({ open, onClose, start = 0, onFinish }) {
  const [i, setI] = useState(0);
  React.useEffect(() => { if (open) setI(typeof start === 'number' ? start : 0); }, [open, start]);
  const st = STEPS[i]; const I = st.icon; const last = i === STEPS.length - 1;
  // 注意：弹窗内不要用 layoutId 共享布局动画（指示点），也不要在关闭时 setI(0)——两者都会让外层 AnimatePresence 等不到退出完成，
  // 透明的遮罩会留在页面上挡住所有点击（v0.4.2 端到端测试发现）。打开时由上面的 effect 复位步骤。
  const close = (goDesktop) => { onClose(); if (goDesktop) onFinish?.('desktop'); };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none', transitionEnd: { display: 'none' } }} onClick={() => close(false)}>
          <motion.div className="modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
            <button className="modal-x" onClick={() => close(false)} aria-label="关闭引导"><X size={16} /></button>
            <div className="guide-art"><motion.div key={i} className="guide-icon" initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}><I size={26} strokeWidth={1.6} /></motion.div></div>
            {/* 步骤内容只做入场动画：内层 AnimatePresence(mode=wait) 会卡住外层弹窗的退出，留下透明遮罩挡住点击 */}
              <motion.div key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={spring}>
                <div className="guide-step">第 {i + 1} 步，共 {STEPS.length} 步</div>
                <h2 id="guide-title">{st.title}</h2>
                <p className="guide-body">{st.body}</p>
                <ul className="guide-points">{st.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </motion.div>
            <div className="guide-foot">
              <div className="dots">{STEPS.map((_, k) => <button key={k} className="dotbtn" onClick={() => setI(k)} aria-label={`第 ${k + 1} 步`}>{k === i && <span className="dot-on" />}</button>)}</div>
              <div className="btnrow">
                {i > 0 ? <MButton className="ghost" onClick={() => setI(i - 1)}><ArrowLeft size={14} />上一步</MButton> : <MButton className="ghost" onClick={() => close(false)}>跳过</MButton>}
                {last
                  ? <MButton className="primary" onClick={() => close(true)}><Play size={14} />去看智能体桌面<ArrowRight size={14} /></MButton>
                  : <MButton className="primary" onClick={() => setI(i + 1)}>下一步<ArrowRight size={14} /></MButton>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
