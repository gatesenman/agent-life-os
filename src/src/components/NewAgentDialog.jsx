import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dna, Shuffle, X, AlertTriangle } from 'lucide-react';
import { MButton } from './ui.jsx';

export default function NewAgentDialog({ open, onClose, onCreate, worldCount }) {
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onCreate(seed.trim() || undefined); setBusy(false); setSeed(''); onClose(); };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none', transitionEnd: { display: 'none' } }} onClick={onClose}>
          <motion.div className="modal" role="dialog" aria-modal="true" aria-labelledby="na-title" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
            <button className="modal-x" onClick={onClose} aria-label="关闭"><X size={16} /></button>
            <div className="guide-art"><div className="guide-icon"><Dna size={24} strokeWidth={1.6} /></div></div>
            <h2 id="na-title">孵化新智能体</h2>
            <p className="guide-body">输入一个 DNA 种子，系统会据此确定性地生成姓名、性格、人生故事、档案卡与 3D 形象。同一个种子永远得到同一个人；留空则随机。</p>
            <label className="field-l">DNA 种子</label>
            <div className="inputrow">
              <input autoFocus className="mono" placeholder="例如：aurora-1998" value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
              <MButton className="ghost" onClick={() => setSeed(Math.random().toString(36).slice(2, 10))} title="随机种子"><Shuffle size={14} /></MButton>
            </div>
            {worldCount > 0 && <div className="notice warn-n"><AlertTriangle size={14} />这会结束当前的 {worldCount} 个世界（包括所有平行世界），并开启新的创世。历史审计日志仍保留在磁盘上。</div>}
            <div className="guide-foot"><span /><div className="btnrow"><MButton className="ghost" onClick={onClose}>取消</MButton><MButton className="primary" disabled={busy} onClick={go}><Dna size={14} />{busy ? '正在创世…' : '创世并孵化'}</MButton></div></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
