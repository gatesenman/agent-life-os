import { useEffect } from 'react';
// 统一处理所有现有弹窗，避免每个业务弹窗各写一套键盘逻辑。
export function useDialogAccessibility() {
  useEffect(() => {
    let current = null, returnTo = null;
    const controls = (d) => [...d.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter((e) => e.offsetParent !== null);
    const sync = () => {
      const next = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter((e) => e.offsetParent !== null && e.closest('.modal-scrim')?.style.pointerEvents !== 'none').at(-1) || null;
      if (next === current) return;
      if (!current && next) returnTo = document.activeElement;
      current = next;
      if (current && !current.contains(document.activeElement)) (current.querySelector('input') || controls(current)[0])?.focus();
      if (!current && returnTo?.isConnected) { returnTo.focus(); returnTo = null; }
    };
    const onKey = (e) => {
      if (!current) return;
      if (e.key === 'Escape') { const close = current.querySelector('.modal-x,button[aria-label="关闭"]'); if (close && !close.disabled) { e.preventDefault(); close.click(); } }
      if (e.key === 'Tab') {
        const all = controls(current), first = all[0], last = all.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || !current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', onKey, true); sync();
    return () => { observer.disconnect(); document.removeEventListener('keydown', onKey, true); };
  }, []);
}
