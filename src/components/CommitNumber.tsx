// A number field that commits on blur/Enter (never on every keystroke) and clamps to its range.
import { useEffect, useState } from 'react';

export default function CommitNumber({ value, onCommit, title, min = 0, max, ariaLabel }: { value: number; onCommit: (v: number) => void; title?: string; min?: number; max?: number; ariaLabel?: string }) {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const raw = Number(text);
    const whole = Number.isFinite(raw) ? Math.round(raw) : NaN;
    const n = Number.isFinite(whole) ? Math.min(max ?? whole, Math.max(min, whole)) : value;
    if (n !== value) onCommit(n);
    else setText(String(value));
  };
  return (
    <input type="number" min={min} max={max} step={10} value={text} title={title} aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-14 px-1 py-0.5 border border-slate-300 rounded text-[10px] font-mono text-center" style={{ direction: 'ltr' }} />
  );
}
