export function nextOptionIndex(index, key, length) {
  if (!length) return -1;
  if (key === 'Home') return 0; if (key === 'End') return length - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + length) % length;
  return -1;
}
